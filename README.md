# ANIMALOOP Studio

A browser-based workspace for making Opla key visuals and posters for the animation festival.

## Run locally

From this folder, start a static server:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open [Cook Your Opla](http://localhost:8765/opla.html) or [Fry Your Poster](http://localhost:8765/poster.html). Use the Project menu to switch between editors.

## Make a key visual

- **Place** — add or remove characters, drag them on the artboard or enter their X/Y coordinates, and choose from ten poses. Select a character to reveal four proportional scale handles and a rotation handle. Hold Shift while rotating to snap to 15° steps. The Place panel lists the shortcuts for copy, paste, duplicate, nudge, delete, and undo. Character scale goes up to 300%. Open Walk to start from the current Place layout.
- **Walk** — choose from ten cycles and eight paths, including angled, radial, orbit, and in-place rotation. Adjust the overall speed or each walker’s speed, choose one-way or back-and-forth travel, play or scrub the cycle, and pick a color before adding a walker. **Copy frame to Place** brings the current walker poses back as still characters.
- **Effect** — adjust each effect independently, with up to 50 copies where Amount applies. Frame-by-frame lets you set the interval between copies. Solitaire stamps previous poses along the walk path. Tiles animate in their cells. Crowd, Continuous line, and Contact sheet create repeated compositions. Blend modes and the Particles, Lo-fi, and Dither filters can be layered over the result.
- **Physics** — grab and swing Opla, then release to drop or flick to throw. **Pile** enables stacking, **Puppet** lets the parts swing independently, and **Click to add Opla** creates a character when you press an empty spot. It follows your pointer until you release it to fall.
- **Camera** — start the camera to mirror head and wrist movement. Mirror follows your framing with one Opla, Center keeps one Opla at the artboard center, and Scene animates all the Oplas from Place together. Auto zoom follows your distance from the camera and can be switched off. Pose tracking runs locally using MediaPipe. The first run needs an internet connection to load the model and runtime. Stop the camera or leave the tab to end tracking.
- **Settings** — choose a canvas preset or apply custom dimensions from 128 to 4096 pixels. Set a color or transparent background, control grid spacing, and enable snapping while placing characters.
- **Capture frame** saves the current visual for export. **Erase frame** clears the artwork and any saved capture. Use Undo to restore the artwork. **Export** downloads the frame as an SVG or a full-size PNG. **Project** saves or opens editable JSON. The browser also remembers your last composition on the same local URL.

## Make a poster

Set the size and palette in **Artboard**. Under **Reset**, choose **Empty poster** to start a blank, aligned grid in either accent color, or choose **Example poster** to restore the example. Use **Layout** to add columns and randomize the grid with or without keeping the column count. Drag a selected block’s edges to resize the grid. Shift-click to select more blocks. The artboard footer splits a block, merges blocks that form a rectangle, and swaps the accents of selected color blocks.

Click a block and type to replace its letter. Press Delete or Backspace to restore its accent color. In **Type**, enter copy or reshuffle the words across the grid. Enable **Jumble grid** to randomize the layout at the same time. Spaces can move the next word to a different row.

In **Add Opla**, select one block or Shift-click connected blocks, then place up to three Oplas per block. Drag the artwork to move it, pull a corner to resize it proportionally up to 200%, or use the top handle to rotate it. Use the keyboard shortcuts from **Place** to nudge, copy, paste, duplicate, or remove. To paste an Opla from **Cook Your Opla**, select its destination blocks first.

Choose a still pose or a movement cycle, adjust the fit and layer, and vary the sizes across a sequence. Pause or scrub the preview to choose a frame. **Settings** controls the rulers, grid lines, workspace dots, and reading order. PNG and SVG exports capture the current frame. Print PNGs use 300 ppi, and print SVGs use millimetres. The browser remembers the poster between visits.

## Swap assets

Replace `src/o.svg`, `src/a.svg`, `src/p.svg`, or `src/l.svg` and refresh. Each component fits its existing rig slot, with mirrored copies for arms and legs. Use standalone vector SVGs with a positive viewBox, or pixel width and height. The importer uses one character color for visible fills and strokes and preserves transparency, cutouts, and supported local clip paths and masks. Outline text and convert embedded images or complex effects to vector shapes before replacing a component. For predictable registration, use a tight viewBox and the same part orientation as the original file.

Edit `palette.json` to replace the swatches. Provide an array of hex strings or objects with `name` and `hex` fields. Give adjacent colors the same optional `group` string to display them together. Refresh to pick up changes.

## References

- [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js) powers camera tracking.
- [Phosphor](https://phosphoricons.com/) provides the tab icons.

- [Open Design Minimal](https://github.com/nexu-io/open-design/tree/main/design-systems/minimal) informed the interface tokens and layout.
- [Spine Anim MCP](https://github.com/K-ulucay/spine_anim_mcp#animation-catalog) informed the opposing leg phases, arm counter-swing, and body bob.
- [vmWalkingKit](https://github.com/nintervik/vmWalkingKit#changelog) informed the stylized gait variations.
- [Promenad](https://github.com/jordgubben/promenad#feature-highlights) informed the stance/swing and travel relationship.
