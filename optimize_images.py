from PIL import Image
import os

WEBSITE_DIR = r"C:\Users\PC\Documents\GameDevelopment\Drug-Theft-Auto-2\drug-theft-auto-2\website"

# Size targets based on usage
SIZES = {
    "enemies": 150,      # Displayed at 80px, give 2x for retina
    "weapons": 150,      # Displayed at 80px
    "characters": 200,   # Mima displayed larger
    "game": {
        "maintitle.png": 600,
        "protagonists.png": 500,
        "background.png": 1200,
        "icon.png": 120,
        "logo.png": 400,
        "star.png": 100,
        "leaderboardbase.png": 300
    }
}

def optimize_image(path, max_size):
    """Resize and optimize a PNG image"""
    try:
        img = Image.open(path)
        
        # Calculate new size maintaining aspect ratio
        ratio = min(max_size / img.width, max_size / img.height)
        if ratio < 1:  # Only resize if larger than target
            new_size = (int(img.width * ratio), int(img.height * ratio))
            img = img.resize(new_size, Image.LANCZOS)
        
        # Save with optimization
        img.save(path, "PNG", optimize=True)
        
        return os.path.getsize(path)
    except Exception as e:
        print(f"  Error: {e}")
        return 0

def main():
    total_before = 0
    total_after = 0
    
    for folder in ["enemies", "weapons", "characters"]:
        folder_path = os.path.join(WEBSITE_DIR, "assets", folder)
        if not os.path.exists(folder_path):
            continue
            
        print(f"\n[{folder}]")
        max_size = SIZES.get(folder, 150)
        
        for filename in os.listdir(folder_path):
            if filename.endswith(".png"):
                filepath = os.path.join(folder_path, filename)
                before = os.path.getsize(filepath)
                total_before += before
                
                after = optimize_image(filepath, max_size)
                total_after += after
                
                print(f"  {filename}: {before//1024}KB -> {after//1024}KB")
    
    # Game folder with custom sizes
    game_path = os.path.join(WEBSITE_DIR, "assets", "game")
    print(f"\n[game]")
    
    for filename, max_size in SIZES["game"].items():
        filepath = os.path.join(game_path, filename)
        if os.path.exists(filepath):
            before = os.path.getsize(filepath)
            total_before += before
            
            after = optimize_image(filepath, max_size)
            total_after += after
            
            print(f"  {filename}: {before//1024}KB -> {after//1024}KB")
    
    # Favicon
    favicon_path = os.path.join(WEBSITE_DIR, "favicon.png")
    if os.path.exists(favicon_path):
        print(f"\n[root]")
        before = os.path.getsize(favicon_path)
        total_before += before
        after = optimize_image(favicon_path, 64)
        total_after += after
        print(f"  favicon.png: {before//1024}KB -> {after//1024}KB")
    
    print(f"\n{'='*40}")
    print(f"TOTAL: {total_before//1024}KB -> {total_after//1024}KB")
    print(f"Saved: {(total_before-total_after)//1024}KB ({100-(total_after*100//total_before)}% reduction)")

if __name__ == "__main__":
    main()

