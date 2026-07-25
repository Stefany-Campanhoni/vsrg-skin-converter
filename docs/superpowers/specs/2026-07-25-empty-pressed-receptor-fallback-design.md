# Empty pressed receptor fallback

## Behavior

Rendering no longer fails merely because a receptor image has no visible pixels. The image processor preserves the transparent source image in that case.

The osu! receptor writer renders the normal state for each direction first. If the pressed state renders as a fully transparent image, its `_tap@2x.png` output reuses the already rendered normal image for that direction. A fully transparent normal state remains transparent rather than throwing.

## Scope

- Keep the existing geometry for receptors containing visible pixels.
- Do not change note rendering or output filenames.
- Cover both the transparent-normal and transparent-pressed cases with automated tests.
