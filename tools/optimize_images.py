import os
import json
from PIL import Image

GALLERY_DIR = 'gallery'
OPTIMIZED_DIR = os.path.join(GALLERY_DIR, 'optimized')
MAX_WIDTH = 2560
QUALITY = 85

def optimize_images():
    if not os.path.exists(OPTIMIZED_DIR):
        os.makedirs(OPTIMIZED_DIR)
        print(f"Created directory: {OPTIMIZED_DIR}")

    files = [f for f in os.listdir(GALLERY_DIR) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    print(f"Found {len(files)} images to process.")

    optimized_files = []

    for filename in files:
        filepath = os.path.join(GALLERY_DIR, filename)
        out_path = os.path.join(OPTIMIZED_DIR, filename)
        
        # Skip if already exists (optional, but good for retries)
        # if os.path.exists(out_path):
        #    print(f"Skipping {filename}: Already exists.")
        #    continue

        try:
            with Image.open(filepath) as img:
                print(f"Processing {filename} ({img.size[0]}x{img.size[1]})...")
                
                # Convert RGBA to RGB if necessary (for saving as JPEG)
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')

                # Resize if wider than MAX_WIDTH
                if img.size[0] > MAX_WIDTH:
                    w_percent = (MAX_WIDTH / float(img.size[0]))
                    h_size = int((float(img.size[1]) * float(w_percent)))
                    img = img.resize((MAX_WIDTH, h_size), Image.Resampling.LANCZOS)
                    print(f"  Resized to {MAX_WIDTH}x{h_size}")
                
                # Save optimized
                img.save(out_path, 'JPEG', quality=QUALITY, optimize=True)
                file_size_mb = os.path.getsize(out_path) / (1024 * 1024)
                print(f"  Saved to {out_path} ({file_size_mb:.2f} MB)")
                
                optimized_files.append(filename)

        except Exception as e:
            print(f"Error processing {filename}: {e}")

    print("Optimization complete.")

if __name__ == "__main__":
    optimize_images()
