"""Replace in-app crest with transparent logo and regenerate Android/web icons."""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
# Prefer the latest attached transparent crest when present; else project copy.
ASSET_CANDIDATES = [
    Path(
        r"C:\Users\Admin\.cursor\projects\e-Project-dev\assets"
        r"\c__Users_Admin_AppData_Roaming_Cursor_User_workspaceStorage_"
        r"15096e6d0c9d3b6e5f7f5e8567d879c1_images_narsil_logo_transparent_"
        r"under_1mb-c6f2fdd7-6bd2-4af1-b40d-3b7e4ca19d07.png"
    ),
    Path(r"E:\Project-dev\narsil-google-logo.png"),
]
BRANDING = ROOT / "public" / "branding"
PUBLIC = ROOT / "public"
RES = ROOT / "android" / "app" / "src" / "main" / "res"


def load_square_crest(src: Path) -> Image.Image:
    """Load logo, convert to RGBA, pad to square with transparent pixels only."""
    img = Image.open(src).convert("RGBA")
    w, h = img.size
    side = max(w, h)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(img, ((side - w) // 2, (side - h) // 2), img)
    return square.resize((512, 512), Image.Resampling.LANCZOS)


def on_black(crest: Image.Image, size: int) -> Image.Image:
    base = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    scaled = crest.resize((size, size), Image.Resampling.LANCZOS)
    base.alpha_composite(scaled)
    return base


def rounded(img: Image.Image, radius_ratio: float = 0.22) -> Image.Image:
    w, h = img.size
    r = int(min(w, h) * radius_ratio)
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=r, fill=255)
    out = img.copy()
    out.putalpha(mask)
    return out


def main() -> None:
    src = next((p for p in ASSET_CANDIDATES if p.exists()), None)
    if src is None:
        raise SystemExit("No crest source found")
    crest = load_square_crest(src)
    print("source", src.name, "crest", crest.size, "corner", crest.getpixel((0, 0)))

    BRANDING.mkdir(parents=True, exist_ok=True)

    # In-app crest — keep true transparency (no black fill)
    crest_path = BRANDING / "narsil-crest.png"
    crest.save(crest_path, "PNG")

    oauth = crest.resize((120, 120), Image.Resampling.LANCZOS)
    oauth.save(BRANDING / "narsil-oauth-logo.png", "PNG")

    on_black(crest, 64).save(PUBLIC / "favicon.png", "PNG")
    on_black(crest, 180).save(PUBLIC / "apple-touch-icon.png", "PNG")
    on_black(crest, 512).save(BRANDING / "narsil-app-icon.png", "PNG")

    densities = {
        "mipmap-mdpi": (48, 108),
        "mipmap-hdpi": (72, 162),
        "mipmap-xhdpi": (96, 216),
        "mipmap-xxhdpi": (144, 324),
        "mipmap-xxxhdpi": (192, 432),
    }

    for folder, (full, fg) in densities.items():
        out_dir = RES / folder
        full_img = on_black(crest, full)
        full_img.save(out_dir / "ic_launcher.png", "PNG")
        rounded(full_img).save(out_dir / "ic_launcher_round.png", "PNG")

        fg_canvas = Image.new("RGBA", (fg, fg), (0, 0, 0, 0))
        inner = int(fg * 0.82)
        plate = Image.new("RGBA", (inner, inner), (0, 0, 0, 255))
        plate.alpha_composite(crest.resize((inner, inner), Image.Resampling.LANCZOS))
        offset = (fg - inner) // 2
        fg_canvas.paste(plate, (offset, offset), plate)
        fg_canvas.save(out_dir / "ic_launcher_foreground.png", "PNG")
        print(folder, "ok")

    saved = Image.open(crest_path)
    print("crest corner after save", saved.getpixel((0, 0)))
    print("done")


if __name__ == "__main__":
    main()
