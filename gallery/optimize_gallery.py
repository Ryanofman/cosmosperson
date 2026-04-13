import os
from PIL import Image
import sys

# Configuration
SOURCE_DIR = "/Users/rofman/cosmosperson/gallery/"
DEST_DIR = "/Users/rofman/cosmosperson/gallery/optimized/"
QUALITY = 85
TARGET_WIDTH = 5625  # Based on M101 width
ALLOWED_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.JPG', '.JPEG', '.PNG')

def optimize_images():
    # Ensure destination directory exists
    if not os.path.exists(DEST_DIR):
        os.makedirs(DEST_DIR)
        print(f"Created directory: {DEST_DIR}")

    files = [f for f in os.listdir(SOURCE_DIR) if f.lower().endswith(ALLOWED_EXTENSIONS)]
    
    if not files:
        print("No images found in the gallery folder.")
        return

    print(f"Found {len(files)} images to optimize and resize.")

    for filename in files:
        source_path = os.path.join(SOURCE_DIR, filename)
        dest_path = os.path.join(DEST_DIR, filename)
        
        if os.path.isdir(source_path):
            continue

        try:
            with Image.open(source_path) as img:
                # Resize logic
                w, h = img.size
                if w != TARGET_WIDTH:
                    # Calculate new height to maintain aspect ratio
                    new_h = int(h * (TARGET_WIDTH / w))
                    print(f"Resizing {filename}: {w}x{h} -> {TARGET_WIDTH}x{new_h}")
                    img = img.resize((TARGET_WIDTH, new_h), Image.Resampling.LANCZOS)

                # Get extension
                _, ext = os.path.splitext(filename)
                ext = ext.lower()

                # Optimization settings
                save_kwargs = {
                    "optimize": True,
                }

                if ext in ('.jpg', '.jpeg'):
                    save_kwargs["quality"] = QUALITY
                    save_kwargs["progressive"] = True
                
                if img.mode in ('RGBA', 'P'):
                    img = img.convert('RGB')
                
                img.save(dest_path, **save_kwargs)
                
                # Compare sizes
                original_size = os.path.getsize(source_path)
                new_size = os.path.getsize(dest_path)
                reduction = (original_size - new_size) / original_size * 100
                
                print(f"Optimized: {filename} ({original_size/1024:.1f}KB -> {new_size/1024:.1f}KB, -{reduction:.1f}%)")

        except Exception as e:
            print(f"Error processing {filename}: {e}")

if __name__ == "__main__":
    optimize_images()
    print("\nOptimization complete!")
