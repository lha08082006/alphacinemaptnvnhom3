from PIL import Image
img = Image.open('images/banner_real.png')
print(f"Width: {img.width}, Height: {img.height}")
print(f"Ratio: {img.width / img.height}")