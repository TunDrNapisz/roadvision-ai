from flask import Flask, request, jsonify, send_from_directory, make_response, Response
from flask_cors import CORS
import cv2
import numpy as np
import os
from dotenv import load_dotenv
import uuid
import exifread
from geopy.geocoders import Nominatim
import json
import time
import datetime
import subprocess
from static_ffmpeg import add_paths
from ultralytics import YOLO
import tensorflow as tf
from tensorflow.keras.preprocessing.image import img_to_array
from tensorflow.keras.applications.efficientnet import preprocess_input
from groq import Groq
from flask import Flask
from flask_socketio import SocketIO
from concurrent.futures import ThreadPoolExecutor



# Tambah path ffmpeg secara automatik
add_paths()

# ==========================================
# 1. CONFIGURATION
# ==========================================
UPLOAD_FOLDER = "uploads"
OUTPUT_FOLDER = "outputfyp"
CROP_FOLDER = "crops"
for folder in [UPLOAD_FOLDER, OUTPUT_FOLDER, CROP_FOLDER]:
    os.makedirs(folder, exist_ok=True)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

socketio = SocketIO(app, cors_allowed_origins="*")

# 3. Cipta background worker
executor = ThreadPoolExecutor(max_workers=3)


@app.before_request
def set_backend_url():
    global BACKEND_URL
    BACKEND_URL = request.host_url.rstrip('/')


# Beritahu python untuk baca 'groq.env'
load_dotenv(dotenv_path='groq.env')

# Ambil kunci daripada environment variable
api_key = os.getenv("GROQ_API_KEY")

# Gunakan api_key tersebut untuk initialize client
groq_client = Groq(api_key=api_key)

# ==========================================
# 2. MODEL LOADING & CONFIGURATION
# ==========================================
yolo_model = None
road_classifier = None

try:
    path_pt = "best10.pt"
    if os.path.exists(path_pt):
        yolo_model = YOLO(path_pt)
        print("[SUCCESS] YOLO Model Loaded")
except Exception as e:
    print(f"[ERROR] YOLO load failed: {e}")

try:
    path_keras = "efficientnet_road_damage_model1.keras"
    if os.path.exists(path_keras):
        road_classifier = tf.keras.models.load_model(path_keras, compile=False)
        print("[SUCCESS] EfficientNet Model Loaded (As Quality Filter)")
except Exception as e:
    print(f"[ERROR] Classifier load failed: {e}")


# ==========================================
# 3. HELPER FUNCTIONS
# ==========================================
# Add this at the top of your main.py
FALLBACK_ADVICE = {
    "longitudinal crack": {
        "punca": "Often caused by poor construction joints, edge settlement, or longitudinal shrinkage.",
        "solusi": "Crack sealing or routing and filling to prevent water infiltration."
    },
    "pothole": {
        "punca": "Water infiltration weakening the base, combined with repeated heavy traffic loading.",
        "solusi": "Full-depth patching, proper sub-base compaction, and surface layer restoration."
    },
    "alligator crack": {
        "punca": "Fatigue failure of the surface layer usually due to heavy overloading or poor subgrade support.",
        "solusi": "Reconstruction of the base and sub-base layers; overlay with high-modulus asphalt."
    },
    "transverse crack": {
        "punca": "Thermal contraction of the asphalt surface or reflective cracking from underlying layers.",
        "solusi": "Crack sealing and installation of stress-absorbing membrane interlayers (SAMI)."
    },
    "rutting": {
        "punca": "Permanent deformation in asphalt layers due to heavy traffic loads or weak pavement structure.",
        "solusi": "Milling of the rutted surface and overlay with rut-resistant polymer-modified asphalt."
    },
    "raveling": {
        "punca": "Disintegration of the asphalt surface due to loss of binder, often caused by aging or poor compaction.",
        "solusi": "Surface treatment, slurry seal, or thin asphalt overlay."
    },
    "block cracking": {
        "punca": "Shrinkage of the asphalt concrete and temperature cycling.",
        "solusi": "Crack sealing for small cracks; thin overlay for extensive block cracking."
    },
    "bleeding": {
        "punca": "Excessive asphalt binder in the mix, usually caused by high temperatures or improper mix design.",
        "solusi": "Applying abrasive materials or milling and replacing the surface layer."
    },
    "edge cracking": {
        "punca": "Lack of lateral support, heavy loads near the pavement edge, or poor drainage.",
        "solusi": "Improve shoulder drainage and reconstruct/widen the pavement edge."
    }
}


# 1. Gabungkan kedua-dua fungsi ini supaya data alamat terus didapati
def get_gps_from_file(filepath):
    try:
        with open(filepath, 'rb') as f:
            tags = exifread.process_file(f, details=False)
            if 'GPS GPSLatitude' not in tags:
                return None

            def _to_degrees(value):
                d = float(value.values[0].num) / float(value.values[0].den)
                m = float(value.values[1].num) / float(value.values[1].den)
                s = float(value.values[2].num) / float(value.values[2].den)
                return d + (m / 60.0) + (s / 3600.0)

            lat = _to_degrees(tags['GPS GPSLatitude'])
            if tags['GPS GPSLatitudeRef'].values == 'S': lat = -lat

            lng = _to_degrees(tags['GPS GPSLongitude'])
            if tags['GPS GPSLongitudeRef'].values == 'W': lng = -lng # Penting: W (West) adalah negatif

            # Tambahan: Reverse Geocoding untuk dapatkan alamat
            geolocator = Nominatim(user_agent="roadvision_ai_fyp")
            location = geolocator.reverse(f"{lat}, {lng}", language='ms')
            address = location.address if location else "Lokasi tidak ditemui"

            return {"lat": lat, "lng": lng, "address": address}
    except:
        return None

def get_expert_advice(damage_type):
    damage_key = damage_type.lower().strip()
    try:
        completion = groq_client.chat.completions.create(
            model="llama3-8b-8192", # Model yang masih disokong
            messages=[
                {"role": "system", "content": "Return ONLY JSON with keys 'punca' and 'solusi'."},
                {"role": "user", "content": f"Expert civil engineering analysis for '{damage_key}'."}
            ],
            response_format={"type": "json_object"}
        )
        return json.loads(completion.choices[0].message.content)
    except Exception as e:
        print(f"[DEBUG] AI API failed: {e}")
        return FALLBACK_ADVICE.get(damage_key, {"punca": "Structural fatigue.", "solusi": "Maintenance required."})


def is_valid_damage(img_bgr):
    if road_classifier is None:
        return True
    try:
        img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        img_resized = cv2.resize(img_rgb, (224, 224))
        img_array = img_to_array(img_resized)
        img_array = preprocess_input(img_array)
        img_array = np.expand_dims(img_array, axis=0)

        preds = road_classifier.predict(img_array, verbose=0)[0]
        confidence = float(np.max(preds))

        if confidence < 0.40:
            print(f"[DEBUG] EfficientNet menolak hasil (Conf: {confidence:.2f})")
            return False
        return True
    except:
        return True


# ==========================================
# 4. IMAGE DETECTION ENDPOINT
# ==========================================

@app.route("/save_to_disk", methods=["POST"])
def save_to_disk():
    file = request.files.get("image")
    if not file:
        return jsonify({"error": "No file provided"}), 400

    # Simpan ke folder spesifik yang anda mahukan
    save_path = os.path.join(OUTPUT_FOLDER, file.filename)
    file.save(save_path)

    return jsonify({"message": "File saved successfully", "path": save_path})


from datetime import datetime


@app.route('/api/get-live-data')
def get_live_data():
    # Inisialisasi 7 hari (Isnin=0, Ahad=6)
    counts = {
        "transverse": [0] * 7,
        "longitudinal": [0] * 7,
        "alligator": [0] * 7
    }

    if not os.path.exists(OUTPUT_FOLDER):
        return jsonify({"error": "Folder tidak dijumpai"}), 404

    for filename in os.listdir(OUTPUT_FOLDER):
        if filename.endswith(".json"):
            file_path = os.path.join(OUTPUT_FOLDER, filename)

            # 1. Dapatkan tarikh sebenar fail
            timestamp = os.path.getmtime(file_path)
            date_obj = datetime.fromtimestamp(timestamp)
            day_index = date_obj.weekday()  # Isnin=0, Sabtu=5, Ahad=6

            try:
                with open(file_path, 'r') as f:
                    data_list = json.load(f)
                    for item in data_list:
                        label = item.get('type', '').lower()

                        # 2. Masukkan ke index hari yang tepat
                        if "alligator" in label:
                            counts["alligator"][day_index] += 1
                        elif "longitudinal" in label:
                            counts["longitudinal"][day_index] += 1
                        elif "transverse" in label:
                            counts["transverse"][day_index] += 1
            except Exception as e:
                continue

    return jsonify({
        "transverse_weekly": counts["transverse"],
        "longitudinal_weekly": counts["longitudinal"],
        "alligator_weekly": counts["alligator"]
    })

@app.route("/")
def index():
    return send_from_directory('.', 'index.html')

@app.route("/detect", methods=["POST"])
def detect():
    if yolo_model is None: return jsonify({"error": "YOLO model not loaded"}), 500
    file = request.files.get("image")
    if not file: return jsonify({"error": "No image uploaded"}), 400

    unique_id = str(uuid.uuid4())
    filename = f"{unique_id}.jpg"
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    file.save(filepath)

    # TAMBAH INI: Dapatkan GPS dari fail asal
    location_data = get_gps_from_file(filepath)

    img = cv2.imread(filepath)
    results = yolo_model.predict(img, conf=0.50)
    grouped_detections = {}

    if len(results) > 0 and results[0].boxes is not None:
        for box in results[0].boxes:
            class_idx = int(box.cls.cpu().numpy()[0])
            label = yolo_model.names[class_idx]
            yolo_conf = float(box.conf.cpu().numpy()[0])

            coords = box.xyxy.cpu().numpy()[0]
            x1, y1, x2, y2 = map(int, coords)
            crop = img[y1:y2, x1:x2]

            if crop.size > 0:
                if not is_valid_damage(crop):
                    continue

                crop_name = f"crop_{uuid.uuid4()}.jpg"
                cv2.imwrite(os.path.join(CROP_FOLDER, crop_name), crop)

                if label not in grouped_detections:
                    advice = get_expert_advice(label)
                    grouped_detections[label] = {"type": label, "expert_info": advice, "images": []}

                grouped_detections[label]["images"].append({
                    "confidence": round(yolo_conf * 100, 2),
                    "crop_url": f"{BACKEND_URL}/crop/{crop_name}"
                })

    res_plotted = results[0].plot()
    cv2.imwrite(os.path.join(OUTPUT_FOLDER, filename), res_plotted)

    # --- ADD THIS TO SAVE METADATA ---
    # We aggregate all detected information for this image
    all_detections_metadata = []
    for label, data in grouped_detections.items():
        all_detections_metadata.append({
            "type": label,
            "confidence": max([img['confidence'] for img in data['images']]),
            "punca": data['expert_info']['punca'],
            "location": location_data,  # TAMBAH BARIS INI
            "solusi": data['expert_info']['solusi'],
            "timestamp": time.strftime("%d/%m/%Y %I:%M:%S %p")
        })

    # Save as JSON with the same filename (e.g., uuid.jpg.json)
    with open(os.path.join(OUTPUT_FOLDER, f"{filename}.json"), 'w') as f:
        json.dump(all_detections_metadata, f)
    # ---------------------------------

        # 4. Sediakan data untuk dihantar ke Frontend
    detections_list = list(grouped_detections.values())
    for item in detections_list:
        item['location'] = location_data

    return jsonify({
        "processed_image": f"{BACKEND_URL}/output/{filename}?t={unique_id}",
        "detections": detections_list
    })


# ==========================================
# 5. VIDEO DETECTION (PEMBETULAN cv2.CAP_PROP)
# ==========================================
@app.route("/detect_video", methods=["POST"])
def detect_video():
    if yolo_model is None:
        return jsonify({"error": "YOLO model not loaded"}), 500

    video_file = request.files.get("video")
    if not video_file:
        return jsonify({"error": "No video uploaded"}), 400

    # 1. PENGENDALIAN LOKASI YANG SELAMAT (Tanpa membuang logik asal)
    lat = request.form.get("lat")
    lng = request.form.get("lng")

    location_data = {"lat": None, "lng": None, "address": "No location detected"}

    # Gantikan bahagian ini dalam detect_video
    if lat and lng and lat != 'undefined' and lng != 'undefined':
        lat_f, lng_f = float(lat), float(lng)

        # JIKA GPS GAGAL (lat=0, lng=0), jangan cuba geolocate
        if lat_f == 0 and lng_f == 0:
            location_data = {"lat": 0, "lng": 0, "address": "Sila aktifkan GPS/Pastikan berada di luar bangunan"}
        else:
            try:
                geolocator = Nominatim(user_agent="road_damage_app")
                location_info = geolocator.reverse(f"{lat_f}, {lng_f}", language='ms')
                address = location_info.address if location_info else f"Lat: {lat_f:.4f}, Lng: {lng_f:.4f}"
                location_data = {"lat": lat_f, "lng": lng_f, "address": address}
            except:
                location_data = {"lat": lat_f, "lng": lng_f,
                                 "address": "Lokasi tidak ditemui (Reverse Geocoding gagal)"}

    # 2. Persediaan fail video
    unique_id = str(uuid.uuid4())
    temp_path = os.path.join(UPLOAD_FOLDER, f"raw_{unique_id}.mp4")
    video_file.save(temp_path)

    cap = cv2.VideoCapture(temp_path)
    width = int(cap.get(3))
    height = int(cap.get(4))
    fps = cap.get(5) or 20

    PADDING_TOP = 60
    new_height = height + PADDING_TOP

    raw_output_path = os.path.join(OUTPUT_FOLDER, f"temp_raw_{unique_id}.mp4")
    final_output_name = f"processed_{uuid.uuid4()}.mp4"
    final_output_path = os.path.join(OUTPUT_FOLDER, final_output_name)

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(raw_output_path, fourcc, fps, (width, new_height))

    grouped_detections = {}
    frame_count = 0
    last_annotated_frame = None

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret: break

        if frame_count % 3 == 0:
            padded_frame = cv2.copyMakeBorder(frame, PADDING_TOP, 0, 0, 0, cv2.BORDER_CONSTANT, value=[0, 0, 0])
            results = yolo_model.track(padded_frame, conf=0.25, persist=True, verbose=False)

            if len(results) > 0 and results[0].boxes is not None:
                annotated_frame = results[0].plot(line_width=3)
                last_annotated_frame = annotated_frame.copy()

                for box in results[0].boxes:
                    class_idx = int(box.cls.cpu().numpy()[0])
                    label = yolo_model.names[class_idx]
                    yolo_conf = float(box.conf.cpu().numpy()[0])

                    coords = box.xyxy.cpu().numpy()[0]
                    x1, y1, x2, y2 = map(int, coords)

                    orig_y1 = max(0, y1 - PADDING_TOP)
                    orig_y2 = max(0, y2 - PADDING_TOP)
                    crop = frame[orig_y1:orig_y2, x1:x2]

                    if crop.size > 0 and is_valid_damage(crop):
                        if label not in grouped_detections:
                            grouped_detections[label] = {
                                "type": label,
                                "expert_info": None,
                                "images": [],
                                "location": location_data  # Guna location_data yang selamat
                            }

                        if len(grouped_detections[label]["images"]) < 3:
                            crop_name = f"v_crop_{uuid.uuid4()}.jpg"
                            cv2.imwrite(os.path.join(CROP_FOLDER, crop_name), crop)
                            grouped_detections[label]["images"].append({
                                "confidence": round(yolo_conf * 100, 2),
                                "crop_url": f"{BACKEND_URL}/crop/{crop_name}"
                            })
            else:
                last_annotated_frame = cv2.copyMakeBorder(frame, PADDING_TOP, 0, 0, 0, cv2.BORDER_CONSTANT,
                                                          value=[0, 0, 0])

        if last_annotated_frame is not None:
            out.write(last_annotated_frame)
        else:
            fallback = cv2.copyMakeBorder(frame, PADDING_TOP, 0, 0, 0, cv2.BORDER_CONSTANT, value=[0, 0, 0])
            out.write(fallback)

        frame_count += 1

    cap.release()
    out.release()

    # Finalize video (FFmpeg)
    try:
        subprocess.run(['ffmpeg', '-i', raw_output_path, '-vcodec', 'libx264', '-crf', '24', '-pix_fmt', 'yuv420p',
                        final_output_path, '-y'], check=True)
        if os.path.exists(raw_output_path): os.remove(raw_output_path)
    except:
        os.rename(raw_output_path, final_output_path)

    # Finalize data
    for label in grouped_detections:
        grouped_detections[label]["expert_info"] = get_expert_advice(label)

    if os.path.exists(temp_path): os.remove(temp_path)

    # Persediaan untuk JSON output
    video_metadata = []
    for label, data in grouped_detections.items():
        video_metadata.append({
            "type": label,
            "punca": data["expert_info"]["punca"],
            "solusi": data["expert_info"]["solusi"],
            "timestamp": time.strftime("%d/%m/%Y %I:%M:%S %p"),
            "images": data["images"],
            "location": data["location"]
        })

    json_filename = f"{final_output_name}.json"
    with open(os.path.join(OUTPUT_FOLDER, json_filename), 'w') as f:
        json.dump(video_metadata, f)

    # Dalam app.py, bahagian akhir fungsi detect_video
    return jsonify({
        "processed_video": f"{BACKEND_URL}/output/{final_output_name}?v={unique_id}",
        "detections": list(grouped_detections.values()),
        "location": location_data  # Hantar terus di sini
    })

@app.route("/detect_snapshot", methods=["POST"])
def detect_snapshot():
    # 1. Semakan awal
    if yolo_model is None:
        return jsonify({"error": "Model not loaded"}), 500
    file = request.files.get("image")
    if not file:
        return jsonify({"error": "No image"}), 400

    # 1.1 Dapatkan koordinat dari frontend
    lat = request.form.get("lat")
    lng = request.form.get("lng")

    # Proses lokasi dan Reverse Geocoding
    location_data = {"lat": None, "lng": None, "address": "No location detected"}

    if lat and lng and lat != 'undefined' and lng != 'undefined' and float(lat) != 0:
        try:
            geolocator = Nominatim(user_agent="roadvision_ai_fyp_v2")
            location = geolocator.reverse(
                f"{lat}, {lng}",
                language='ms',
                addressdetails=True,
                zoom=18
            )

            if location:
                addr = location.raw.get("address", {})
                parts = [addr.get("residential") or addr.get("road"), addr.get("suburb"), addr.get("city"), "Malaysia"]
                address = ", ".join([p for p in parts if p])
            else:
                address = f"Lat: {float(lat):.4f}, Lng: {float(lng):.4f}"

            location_data = {"lat": float(lat), "lng": float(lng), "address": address}
        except Exception as e:
            print(f"[ERROR] Reverse geocoding failed: {e}")

    # 2. Proses Imej
    nparr = np.frombuffer(file.read(), np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return jsonify({"error": "Invalid image"}), 400

    img_resized = cv2.resize(img, (640, 640))
    results = yolo_model.predict(img_resized, conf=0.50)

    grouped_detections = {}

    # 3. Proses hasil deteksi
    if len(results) > 0 and results[0].boxes is not None:
        h, w = img.shape[:2]
        for i, box in enumerate(results[0].boxes):
            class_idx = int(box.cls.cpu().numpy()[0])
            label = yolo_model.names[class_idx]
            yolo_conf = float(box.conf.cpu().numpy()[0])

            # Skala koordinat box
            coords = box.xyxy.cpu().numpy()[0]
            x1, y1 = int(coords[0] * w / 640), int(coords[1] * h / 640)
            x2, y2 = int(coords[2] * w / 640), int(coords[3] * h / 640)
            x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)

            # Ekstrak Segmentation Mask (jika model -seg)
            segment_points = []
            if results[0].masks is not None and i < len(results[0].masks.xy):
                mask_coords = results[0].masks.xy[i]
                segment_points = [[float(c[0] * w / 640), float(c[1] * h / 640)] for c in mask_coords]

            crop = img[y1:y2, x1:x2]
            if crop.size > 0 and is_valid_damage(crop):
                crop_name = f"snap_{uuid.uuid4()}.jpg"
                cv2.imwrite(os.path.join(CROP_FOLDER, crop_name), crop)

                if label not in grouped_detections:
                    grouped_detections[label] = {
                        "type": label,
                        "expert_info": get_expert_advice(label),
                        "images": [],
                        "location": location_data
                    }

                grouped_detections[label]["images"].append({
                    "confidence": round(yolo_conf * 100, 2),
                    "crop_url": f"{BACKEND_URL}/crop/{crop_name}",
                    "box": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                    "segment": segment_points
                })

    return jsonify({"detections": list(grouped_detections.values())})



# ==========================================
# 6. LIVE CCTV MONITORING
# ==========================================
@app.route("/generate_cctv_stream", methods=["POST"])
def generate_cctv_stream(source_origin):
    camera = cv2.VideoCapture(source_origin)
    PADDING_TOP = 60
    already_cropped_ids = set()

    while True:
        success, frame = camera.read()
        if not success: break

        padded_frame = cv2.copyMakeBorder(frame, PADDING_TOP, 0, 0, 0, cv2.BORDER_CONSTANT, value=[0, 0, 0])
        results = yolo_model.track(padded_frame, conf=0.50, persist=True, verbose=False)

        if len(results) > 0 and results[0].boxes is not None:
            annotated_frame = results[0].plot(line_width=3)
            for box in results[0].boxes:
                if box.id is not None:
                    obj_id = int(box.id.cpu().numpy()[0])
                    if obj_id not in already_cropped_ids:
                        class_idx = int(box.cls.cpu().numpy()[0])
                        label = yolo_model.names[class_idx]
                        coords = box.xyxy.cpu().numpy()[0]
                        crop = frame[max(0, int(coords[1] - PADDING_TOP)):max(0, int(coords[3] - PADDING_TOP)), int(
                            coords[0]):int(coords[2])]

                        if crop.size > 0 and is_valid_damage(crop):
                            crop_name = f"cctv_{label.lower().replace(' ', '_')}_{obj_id}_{uuid.uuid4()}.jpg"
                            cv2.imwrite(os.path.join(CROP_FOLDER, crop_name), crop)

                            # ========================================================
                            # PENTING: TAMBAH BARIS INI DI SINI!
                            # Menghantar tugas pemprosesan pakar & emit socket ke background thread
                            # ========================================================
                            # Ekstrak nilai confidence siap-siap (contoh: 0.85)
                            conf_value = float(box.conf.cpu().numpy()[0])

                            # Hantar nombor conf_value, JANGAN hantar objek box
                            executor.submit(handle_cctv_socket_emit, label, conf_value, crop_name)

                            # Kekalkan logik asal anda untuk mengunci objek ID ini
                            already_cropped_ids.add(obj_id)
        else:
            annotated_frame = padded_frame.copy()

        ret, buffer = cv2.imencode('.jpg', annotated_frame)
        if ret: yield (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
    camera.release()


def handle_cctv_socket_emit(label, conf_value, crop_name):
    try:
        # 1. Pastikan model di dalam fungsi ini (get_expert_advice) dah diganti ke model baru!
        advice = get_expert_advice(label)
        timestamp_now = datetime.now().strftime("%I:%M:%S %p")
        confidence_score = round(conf_value * 100, 2)

        metadata = [{
            "type": label,
            "confidence": confidence_score,
            "punca": advice.get('punca', 'Thermal contraction of the asphalt surface.'),
            "solusi": advice.get('solusi', 'Crack sealing or maintenance required.'),
            "timestamp": timestamp_now,
            "crop_url": f"/crop/{crop_name}"
        }]

        unique_json_name = f"cctv_rec_{uuid.uuid4().hex[:8]}.json"
        with open(os.path.join(OUTPUT_FOLDER, unique_json_name), 'w') as f:
            json.dump(metadata, f)

        payload = {
            "detections": [{
                "type": label,
                "images": [{
                    "confidence": confidence_score,
                    "crop_url": f"/crop/{crop_name}"
                }],
                "expert_info": advice,
                "timestamp": timestamp_now
            }]
        }

        # 2. PEMBAIKAN: Gunakan app_context DAN buang keyword 'broadcast'
        with app.app_context():
            socketio.emit('new_detection', payload)

        print(f"📡 [SOCKET SUCCESS] Data bagi kerosakan '{label}' berjaya dihantar ke Frontend!")

    except Exception as e:
        print(f"❌ [SOCKET ERROR] Gagal di dalam thread: {str(e)}")



@app.route("/video_feed")
def video_feed():
    source = request.args.get('source', default='0')
    return Response(generate_cctv_stream(int(source) if source.isdigit() else source),
                    mimetype='multipart/x-mixed-replace; boundary=frame')



# Tambah ini di app.py
@app.route("/get_all_outputs", methods=["GET"])
def get_all_outputs():
    files = os.listdir(OUTPUT_FOLDER)
    # Tukar supaya ambil .jpg, .png DAN .mp4
    files = [f for f in files if f.endswith(('.jpg', '.png', '.jpeg', '.mp4'))]
    # Susun supaya yang terbaru di atas
    files.sort(key=lambda x: os.path.getmtime(os.path.join(OUTPUT_FOLDER, x)), reverse=True)
    return jsonify({"images": files})


@app.route("/output/<filename>")
def output_file(filename): return send_from_directory(OUTPUT_FOLDER, filename)


@app.route("/crop/<filename>")
def crop_file(filename): return send_from_directory(CROP_FOLDER, filename)

from flask import abort # Import abort di bahagian atas

@app.route("/get_json/<path:filename>")
def get_json(filename):
    # Semak sama ada fail wujud sebelum menghantar
    file_path = os.path.join(OUTPUT_FOLDER, filename)
    if not os.path.exists(file_path):
        return jsonify({"error": "JSON file not found"}), 404
    return send_from_directory(OUTPUT_FOLDER, filename)


@app.route('/delete_media/<filename>', methods=['DELETE'])
def delete_file(filename):
    try:
        # Bina laluan penuh fail menggunakan OUTPUT_FOLDER yang anda miliki
        file_path = os.path.join(OUTPUT_FOLDER, filename)
        # Fail JSON biasanya disimpan dengan nama yang sama + .json
        json_path = os.path.join(OUTPUT_FOLDER, f"{filename}.json")

        # Log untuk tujuan debugging dalam terminal anda
        print(f"Mencuba untuk memadam: {file_path}")

        # 1. Padam fail media (gambar/video)
        if os.path.exists(file_path):
            os.remove(file_path)
            print("Fail media dipadam.")
        else:
            print("Fail media tidak dijumpai.")

        # 2. Padam fail JSON yang berkaitan
        if os.path.exists(json_path):
            os.remove(json_path)
            print("Fail JSON dipadam.")
        else:
            print("Fail JSON tidak dijumpai.")

        return {"message": "Fail berjaya dipadam"}, 200

    except Exception as e:
        print(f"Ralat sistem: {e}")
        return {"message": f"Gagal memadam fail: {str(e)}"}, 500

if __name__ == "__main__":
    # Gantikan app.run(...) dengan socketio.run(...)
    # 'debug=True' boleh dikekalkan untuk tujuan pembangunan
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
