# RoadVision AI 🛣️

Real-time road damage detection and geolocation-based monitoring system for automated infrastructure maintenance support.

## Overview

RoadVision AI uses computer vision to automatically detect, classify, and geo-tag road damage from images or video feeds — helping local authorities and maintenance teams prioritize repairs without manual inspection.

## Key Features

- **Real-time detection** using YOLOv8 for identifying and classifying road damage
- **Secondary quality filter** with EfficientNet-B0 to validate detection confidence and reduce false positives
- **Live geolocation tagging** for automated road condition monitoring
- **3 damage categories** detected: alligator cracking, longitudinal cracking, transverse cracking

## Performance

| Metric | Result |
|---|---|
| mAP50 | 88% |
| Recall | 85.2% |
| Inference speed | ~4ms per image |

## Tech Stack

- **Detection Model:** YOLOv8
- **Validation Model:** EfficientNet-B0
- **Language:** Python
- **Frontend:** HTML, CSS, JavaScript

## How It Works

1. Input image/frame is passed through the YOLOv8 detection model
2. Detected regions are classified into one of three damage categories
3. EfficientNet-B0 acts as a secondary filter to validate detection confidence
4. Valid detections are tagged with live geolocation data
5. Results are logged for infrastructure maintenance planning

## Sample Damage Categories

- `Alligator_Crack.jpg` — interconnected cracking pattern resembling alligator skin
- `Longitudinal_Crack.jpg` — cracks running parallel to the road direction
- `Transverse_Crack.jpg` — cracks running perpendicular to the road direction

## Author

**Muhammad Naffiz Bin Sazali**
Final-year AI student, Universiti Teknikal Malaysia Melaka (UTeM)
📧 naffizsazali02@gmail.com | [LinkedIn](https://linkedin.com/in/muhammad-naffiz-sazali-7534a02aa)
