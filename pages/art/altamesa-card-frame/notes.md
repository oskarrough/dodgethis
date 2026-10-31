# Altamesa in red stone

B is the shipped choice. Its stepped lilac recess reads as carved sandstone at card size; A keeps small rosettes in the corners and breaks the frame into broader blocks. Both came from OpenCode image generation with the current day frame as image 1. Each folder holds the exact submitted prompt and the script-built prompt with its reference path.

The generator returned 1254 × 1254 images despite the requested 512 × 512 canvas. B was resized to 512 × 512 with ImageMagick, preserving alpha, and encoded as WebP at quality 90 for `public/splash/frame-mesa.webp`. The card retains its existing slice of 80 and border width; the frame colour filter is removed, while the title wash keeps its terracotta tint.

For this restricted worktree, capture needs writable temporary locations: `BUN_TMPDIR=/tmp` for the dev server and `XDG_RUNTIME_DIR=/tmp/altamesa-runtime` for the browser socket.
