# osu! Receptor Canvas Scale Design

## Goal

Reduce the Etterna-to-osu! receptor canvas dilation from three pixels to two pixels per osu!
hit-position point while preserving the existing image sizing, alignment, and safety rules.

## Formula

The rendered canvas height is:

```text
baseHeight + (referenceHitPosition - hitPosition) * pixelsPerHitPositionPoint
```

For osu!, `pixelsPerHitPositionPoint` is `2`.

With a `356 px` base canvas and reference hit position `438`:

- hit position `432` produces `356 + 6 * 2 = 368 px`;
- hit position `438` produces `356 px`;
- hit position `440` produces `356 - 2 * 2 = 352 px`.

The final canvas height remains no smaller than the rendered receptor image.

## Responsibility

The scale is an osu!-specific rendering convention. The osu! writer owns the value and
passes it to the shared Sharp image processor. The image infrastructure applies a supplied
linear scale and does not contain an implicit osu! default.

This keeps the infrastructure reusable for future target formats and conversion directions.

## Preserved Behavior

- The receptor is anchored to the top of the transparent canvas.
- The receptor is horizontally centered.
- Receptors larger than `150 px` are proportionally reduced.
- Receptors smaller than `150 px` are not enlarged.
- The canvas is never shorter than the rendered receptor.
- Tap-note rendering is unchanged.

## Testing

The change follows test-driven development:

1. update the image-processor test to expect `368 px` at hit position `432` and `352 px` at
   hit position `440`;
2. update the Etterna-to-osu! integration test to expect a `150 x 368 px` receptor;
3. run the focused tests and confirm they fail under the current three-pixel scale;
4. pass the osu!-owned two-pixel scale into the image processor;
5. run the complete tests, typecheck, lint, architecture checks, and real-skin rendering
   audit.

The README coordinate documentation is updated to describe two pixels per one osu!
hit-position point.
