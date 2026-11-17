"""Build the original 836 x 470 carriage scene layers. Requires Pillow."""

from pathlib import Path
import random

from PIL import Image, ImageDraw, ImageEnhance, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "art" / "source"
OUTPUT = ROOT / "public" / "art"
OUTPUT.mkdir(parents=True, exist_ok=True)
SIZE = (836, 470)
WINDOWS = [
    [(89, 103), (269, 103), (273, 108), (273, 258), (269, 262), (89, 262), (85, 258), (85, 108)],
    [(326, 103), (508, 103), (513, 108), (513, 258), (508, 262), (326, 262), (321, 258), (321, 108)],
    [(563, 103), (745, 103), (750, 108), (750, 258), (745, 262), (563, 262), (558, 258), (558, 108)],
]


def save(image, name):
    image.save(OUTPUT / name, optimize=True)


# The generated image is source art. The dark window wells become actual holes,
# allowing every outdoor layer and weather effect to move independently.
carriage = Image.open(SOURCE / "carriage-source.png").convert("RGBA")
carriage = carriage.resize(SIZE, Image.Resampling.NEAREST)
window_mask = Image.new("L", SIZE)
mask_draw = ImageDraw.Draw(window_mask)
for pane in WINDOWS:
    mask_draw.polygon(pane, fill=255)
carriage.putalpha(ImageOps.invert(window_mask))
save(carriage, "carriage.png")
save(window_mask, "window-mask.png")


# The 3:1 original illustration is cropped to a carriage-length panorama. Its
# detail is composed into the band seen through the three 16:9 window panes.
source_valley = Image.open(SOURCE / "valley-source.png").convert("RGB")
valley_band = source_valley.crop((252, 0, 1924, 724)).resize((836, 230), Image.Resampling.NEAREST)
detail_rng = random.Random(41863)
valley_draw = ImageDraw.Draw(valley_band)

# Small architectural clusters follow the station roof, broken stone arcade,
# hilltop ruins, and bridge already present in the source art.
for x in range(43, 292, 5):
    for y in range(105 + x % 3, 123, 4):
        if detail_rng.random() < .72:
            valley_draw.line((x, y, x + detail_rng.randrange(2, 5), y), fill=detail_rng.choice(("#58677c", "#344255", "#82919a")))
for left, right, top, bottom in ((286, 461, 129, 165), (448, 500, 56, 82), (558, 800, 86, 151)):
    for y in range(top, bottom, 4):
        for x in range(left + (y % 8) * 2, right, 7):
            if detail_rng.random() < .46:
                valley_draw.line((x, y, x + detail_rng.randrange(1, 4), y), fill=detail_rng.choice(("#8295a1", "#293e59", "#50667c")))
for _ in range(820):
    x, y = detail_rng.randrange(0, 836), detail_rng.randrange(171, 224)
    if detail_rng.random() < .65:
        valley_draw.line((x, y, x + detail_rng.randrange(1, 5), y), fill=detail_rng.choice(("#56717a", "#283e51", "#796e70")))

STAGES = {
    "dawn": ((12, 17, 38), (99, 83, 116), (237, 161, 116), 1.00),
    "morning": ((22, 42, 60), (104, 149, 161), (245, 207, 154), 1.18),
    "afternoon": ((19, 46, 64), (87, 143, 156), (203, 224, 210), 1.22),
    "sunset": ((24, 23, 53), (110, 74, 115), (255, 155, 99), 1.08),
    "twilight": ((12, 18, 45), (70, 69, 115), (178, 128, 165), 0.96),
    "night": ((5, 12, 30), (34, 55, 87), (111, 135, 158), 0.76),
}

gray = ImageOps.grayscale(valley_band)
warm_lights = Image.new("RGBA", valley_band.size)
original = valley_band.load()
warm_pixels = warm_lights.load()
for y in range(valley_band.height):
    for x in range(valley_band.width):
        r, g, b = original[x, y]
        if r > 118 and r > g * 1.22 and g > b * 1.22:
            warm_pixels[x, y] = (r, g, b, min(220, int((r - g) * 2.2)))

for name, (shadow, middle, light, brightness) in STAGES.items():
    colored = ImageOps.colorize(gray, shadow, light, mid=middle, blackpoint=8, whitepoint=215)
    colored = Image.blend(colored, valley_band, 0.18)
    colored = ImageEnhance.Brightness(colored).enhance(brightness).convert("RGBA")
    colored.alpha_composite(warm_lights)
    canvas = Image.new("RGBA", SIZE)
    canvas.alpha_composite(colored, (0, 55))
    save(canvas, f"valley-{name}.png")

architecture_lights = Image.new("RGBA", SIZE)
light_draw = ImageDraw.Draw(architecture_lights)
for x, y in ((102, 193), (119, 194), (127, 199), (157, 196), (267, 205),
             (459, 122), (469, 117), (479, 121), (584, 191), (610, 190),
             (659, 155), (699, 151), (738, 150)):
    light_draw.rectangle((x - 3, y - 2, x + 3, y + 2), fill=(235, 161, 84, 22))
    light_draw.rectangle((x - 1, y - 1, x + 1, y + 1), fill=(249, 193, 107, 108))
    light_draw.point((x, y), fill=(255, 226, 157, 215))
save(architecture_lights, "architecture-lights.png")

fog = Image.new("RGBA", SIZE)
fog_draw = ImageDraw.Draw(fog)
for _ in range(560):
    x, y = detail_rng.randrange(0, 836), detail_rng.choice((143, 164, 185, 215, 233)) + detail_rng.randrange(-10, 11)
    length = detail_rng.randrange(4, 38)
    fog_draw.line((x, y, min(835, x + length), y), fill=(167, 190, 208, detail_rng.randrange(5, 23)))
save(fog, "valley-fog.png")

water = Image.new("RGBA", SIZE)
water_draw = ImageDraw.Draw(water)
for _ in range(185):
    x, y = detail_rng.randrange(482, 835), detail_rng.randrange(239, 277)
    width = detail_rng.randrange(2, 12)
    water_draw.line((x, y, min(835, x + width), y), fill=detail_rng.choice(((204, 214, 224, 34), (247, 195, 127, 31), (107, 151, 185, 54))))
save(water, "water-shimmer.png")

birds = Image.new("RGBA", SIZE)
bird_draw = ImageDraw.Draw(birds)
for x, y, scale in ((187, 145, 1), (214, 151, 2), (235, 141, 1), (247, 155, 1)):
    bird_draw.line((x - scale * 4, y - scale, x, y + scale, x + scale * 4, y - scale), fill=(13, 24, 43, 170), width=1)
    bird_draw.point((x, y + scale + 1), fill=(13, 24, 43, 130))
save(birds, "distant-birds.png")


def pine(draw, x, foot, height, palette, rng):
    trunk = max(1, height // 34)
    draw.rectangle((x - trunk, foot - height + 8, x + trunk, foot), fill=palette[0])
    for tier in range(12):
        y = foot - height + 9 + tier * (height - 19) // 13
        spread = int((tier + 2) * height / 44) + rng.randrange(-3, 4)
        for side in (-1, 1):
            tip = x + side * spread
            draw.line((x, y, tip, y + rng.randrange(3, 8)), fill=palette[0], width=2)
            for _ in range(max(4, spread // 2)):
                px = x + side * rng.randrange(1, max(3, spread))
                py = y + rng.randrange(-4, 8)
                length = rng.choice((2, 3, 4, 6))
                draw.rectangle((px, py, px + length, py + rng.choice((1, 2, 3))), fill=rng.choices(palette[1:], weights=(7, 2, 1))[0])
                if rng.random() < .25:
                    draw.rectangle((px + 1, py + 3, px + 2, py + 5), fill=palette[1])


rng = random.Random(24291)
mid = Image.new("RGBA", SIZE)
mid_draw = ImageDraw.Draw(mid)
for x in range(-20, 870, 22):
    height = rng.randrange(33, 68)
    pine(mid_draw, x + rng.randrange(-5, 6), 265 + rng.randrange(-3, 4), height,
         ("#172736bf", "#203544b8", "#31505da0", "#41616a8c"), rng)
save(mid, "mid-pines.png")

near = Image.new("RGBA", SIZE)
near_draw = ImageDraw.Draw(near)
for x in [4, 61, 128, 192, 250, 304, 380, 434, 495, 558, 625, 697, 762, 825]:
    height = rng.randrange(65, 106)
    pine(near_draw, x, 277, height,
         ("#0d1725", "#132934", "#244047", "#305057"), rng)
    for _ in range(8):
        px, py = x + rng.randrange(-22, 23), rng.randrange(251, 274)
        near_draw.rectangle((px, py, px + rng.randrange(2, 6), py + 1), fill=rng.choice(("#3b5755", "#665e6a", "#766f61")))
save(near, "near-pines.png")

ground = Image.new("RGBA", SIZE)
ground_draw = ImageDraw.Draw(ground)
for _ in range(330):
    x, y = rng.randrange(0, 836), rng.randrange(242, 281)
    width = rng.randrange(2, 10)
    ground_draw.polygon([(x, y), (x + 2, y - rng.randrange(1, 4)), (x + width, y), (x + width + 1, y + 2), (x, y + 2)],
                        fill=rng.choice(("#1a2736bb", "#2b3a49bb", "#4b5260a0")))
    if rng.random() < .38:
        ground_draw.line((x + 2, y, x + width - 1, y), fill=(149, 154, 160, 60))
for _ in range(230):
    x, y = rng.randrange(0, 836), rng.randrange(246, 282)
    ground_draw.line((x, y, x - rng.randrange(1, 4), y - rng.randrange(2, 8)), fill=rng.choice(("#243a3db8", "#47645699", "#5d5d6299")))
    if rng.random() < .09:
        ground_draw.point((x, y - 5), fill=(190, 139, 174, 125))
save(ground, "foreground-ground.png")

glass = Image.new("RGBA", SIZE)
glass_draw = ImageDraw.Draw(glass)
for pane in WINDOWS:
    left, top = pane[0]
    right, bottom = pane[2][0], pane[4][1]
    for _ in range(145):
        x, y = rng.randrange(left + 5, right - 5), rng.randrange(top + 5, bottom - 4)
        shade = rng.choice(((203, 213, 226, 24), (236, 205, 168, 17), (176, 193, 218, 28)))
        glass_draw.rectangle((x, y, x + rng.choice((1, 1, 2)), y + rng.choice((1, 2, 3))), fill=shade)
    for _ in range(7):
        x = rng.randrange(left + 9, right - 8)
        y = rng.randrange(top + 15, bottom - 24)
        glass_draw.line((x, y, x - 2, y + rng.randrange(8, 18)), fill=(205, 220, 238, 28), width=1)
    glass_draw.line((left + 5, top + 13, left + 5, bottom - 15), fill=(255, 232, 185, 36), width=2)
    glass_draw.line((right - 8, top + 12, right - 8, bottom - 20), fill=(175, 198, 226, 28), width=2)
    for _ in range(17):
        x, y = rng.randrange(left + 13, right - 12), rng.randrange(top + 9, bottom - 9)
        glass_draw.line((x, y, x + 3, y + 1), fill=(252, 223, 183, rng.randrange(14, 36)))
save(glass, "glass.png")

glass_rain = Image.new("RGBA", SIZE)
glass_rain_draw = ImageDraw.Draw(glass_rain)
for pane in WINDOWS:
    left, top = pane[0]
    right, bottom = pane[2][0], pane[4][1]
    for _ in range(75):
        x, y = rng.randrange(left + 7, right - 7), rng.randrange(top + 6, bottom - 8)
        radius = rng.choice((1, 1, 2, 2, 3))
        glass_rain_draw.rectangle((x + radius, y + 1, x + radius + 1, y + radius + 1), fill=(11, 26, 51, 69))
        glass_rain_draw.rectangle((x, y, x + radius, y + radius), fill=(179, 203, 227, rng.randrange(60, 126)))
        glass_rain_draw.point((x, y), fill=(244, 239, 218, 180))
        if rng.random() < .33:
            length = rng.randrange(5, 24)
            glass_rain_draw.line((x + radius, y + radius + 1, x + radius - 1, min(bottom - 4, y + length)), fill=(175, 200, 225, 43), width=1)
            glass_rain_draw.point((x + radius - 1, min(bottom - 4, y + length)), fill=(237, 225, 197, 81))
    for _ in range(7):
        x, y = rng.randrange(left + 10, right - 10), rng.randrange(top + 25, bottom - 26)
        glass_rain_draw.line((x, y, x - 2, y + rng.randrange(17, 35)), fill=(191, 217, 239, 40), width=2)
        glass_rain_draw.line((x - 1, y + 2, x - 3, y + 16), fill=(255, 220, 167, 39), width=1)
save(glass_rain, "glass-rain.png")

for frame in range(4):
    falling = Image.new("RGBA", SIZE)
    falling_draw = ImageDraw.Draw(falling)
    frame_rng = random.Random(814 + frame)
    for _ in range(265):
        x, y = frame_rng.randrange(75, 760), frame_rng.randrange(88, 272)
        length = frame_rng.randrange(4, 15)
        falling_draw.line((x, y, x - 2, y + length), fill=frame_rng.choice(((214, 226, 241, 76), (176, 205, 236, 60), (251, 222, 186, 49))), width=1)
        if frame_rng.random() < .25:
            falling_draw.point((x - 2, y + length + 2), fill=(188, 214, 238, 48))
    save(falling, f"rain-{frame}.png")

carriage_detail = Image.new("RGBA", SIZE)
interior_draw = ImageDraw.Draw(carriage_detail)
for _ in range(520):
    x, y = rng.randrange(84, 753), rng.randrange(321, 387)
    length = rng.randrange(1, 17)
    interior_draw.line((x, y, min(752, x + length), y),
                       fill=rng.choice(((255, 184, 105, 21), (255, 215, 154, 29), (23, 9, 25, 31))))
for _ in range(390):
    x = rng.choice((rng.randrange(0, 69), rng.randrange(771, 836)))
    y = rng.randrange(264, 457)
    interior_draw.rectangle((x, y, x + rng.choice((1, 2, 3)), y + 1),
                            fill=rng.choice(((237, 139, 147, 31), (117, 45, 80, 44), (249, 196, 124, 23))))
for x in (45, 791):
    for y in (43, 61, 83, 105):
        interior_draw.rectangle((x - 1, y, x + 1, y + 1), fill=(255, 221, 154, 55))
for x in (105, 166, 264, 371, 468, 562, 661, 729):
    interior_draw.line((x, 321, x + 10, 321), fill=(255, 199, 118, 47))
save(carriage_detail, "carriage-detail.png")

lamp_light = Image.new("RGBA", SIZE)
light_pixels = lamp_light.load()
mask_pixels = window_mask.load()
for y in range(SIZE[1]):
    for x in range(SIZE[0]):
        if mask_pixels[x, y]:
            continue
        left = max(0, 1 - ((x - 45) / 130) ** 2 - ((y - 77) / 180) ** 2)
        right = max(0, 1 - ((x - 791) / 130) ** 2 - ((y - 77) / 180) ** 2)
        table_left = max(0, 1 - ((x - 211) / 170) ** 2 - ((y - 344) / 45) ** 2)
        table_right = max(0, 1 - ((x - 625) / 170) ** 2 - ((y - 344) / 45) ** 2)
        strength = max(left * 42, right * 42, table_left * 22, table_right * 22)
        level = (int(strength) // 6) * 6
        if level > 0 and ((x * 928371 + y * 364479 + x * y * 973) & 255) < 197:
            light_pixels[x, y] = (255, 159, 80, level)
save(lamp_light, "lamp-light.png")

sprite = Image.new("RGBA", (32, 8))
sprite_draw = ImageDraw.Draw(sprite)
for frame, radius in enumerate((1, 2, 2, 1)):
    cx = frame * 8 + 4
    sprite_draw.rectangle((cx - radius - 1, 3 - radius - 1, cx + radius + 1, 3 + radius + 1), fill=(234, 176, 95, 55))
    sprite_draw.rectangle((cx - radius, 3 - radius, cx + radius, 3 + radius), fill=(255, 209, 124, 150))
    sprite_draw.rectangle((cx, 3, cx, 3), fill=(255, 243, 192, 255))
save(sprite, "firefly-strip.png")

for name, colors in {
    "panel-texture.png": ((231, 181, 119, 22), (8, 14, 31, 45)),
    "paper-texture.png": ((102, 72, 53, 23), (255, 245, 208, 36)),
}.items():
    tile = Image.new("RGBA", (64, 64))
    tile_draw = ImageDraw.Draw(tile)
    for _ in range(150):
        x, y = rng.randrange(64), rng.randrange(64)
        color = rng.choice(colors)
        tile_draw.rectangle((x, y, min(63, x + rng.choice((1, 2, 3))), y), fill=color)
    for y in (12, 31, 52):
        tile_draw.line((rng.randrange(8), y, rng.randrange(42, 64), y), fill=colors[1])
    save(tile, name)

previews = ROOT / "art" / "previews"
previews.mkdir(exist_ok=True)
for stage, rainy in (("afternoon", False), ("night", False), ("night", True)):
    preview = Image.open(OUTPUT / f"valley-{stage}.png").convert("RGBA")
    layers = ["architecture-lights.png", "water-shimmer.png", "valley-fog.png", "distant-birds.png", "mid-pines.png", "near-pines.png", "foreground-ground.png"]
    if rainy:
        layers.append("rain-0.png")
    layers.append("glass.png")
    if rainy:
        layers.append("glass-rain.png")
    layers.extend(("carriage.png", "carriage-detail.png", "lamp-light.png"))
    for layer in layers:
        image = Image.open(OUTPUT / layer).convert("RGBA")
        if stage == "afternoon" and layer in ("architecture-lights.png", "lamp-light.png"):
            image.putalpha(image.getchannel("A").point(lambda alpha: round(alpha * .1)))
        preview.alpha_composite(image)
    preview.save(previews / ("rainy-night.png" if rainy else f"{stage}.png"), optimize=True)

print("Built six journey stage rasters and layered detail assets, plus three review previews")
