# F19 compositing tree repair

The existing coverage mask plus ordinary layer insertion is insufficient: a sampled set can cross isolated groups, while an unsampled foreground sibling remains inside one of those groups. Flattening the sample at its LCA moves that foreground behind the edit or applies an ancestor opacity twice.

Invariants:

1. Original source objects and parent/child topology remain untouched. Hiding/deleting the repair restores the source rendering; undo and project roundtrip preserve this relation.
2. current samples one source at its compositing position; below samples the selected paint frontier and lower content; visible samples all eligible visible content. Unsampled paint stays at its original tree position.
3. Ancestor geometry/opacity/filter/blend applies once. Document-space coordinates do not imply root compositing placement.
4. A repair is a virtual replacement operation, not an ordinary image that can be inserted at the root to approximate the source set.
5. Pixel regressions must include source alpha128, same-group upper/base, group opacity50, cross-root visible, and cross-root below with unsampled nested upper simultaneously.

Implementation direction: retain repair metadata as an operation and render source replacement at source tree positions. Derive replacement planes in the sampling tree's compositing space rather than moving a flattened aggregate above unselected foreground. A flattened sample alone is not sufficient to derive individual source planes under arbitrary blend/filter operations, so source contribution and local alpha planes must be captured as part of the operation. Implement normal source-over/opacity first with explicit exact pixel tests; any unsupported existing scope remains unfinished and cannot be accepted.

Current task has no successful report for this new architecture. No changes to other features are authorized here.
