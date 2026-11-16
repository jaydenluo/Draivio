# Portrait evaluation photographs

These are real photographs downloaded at 768px from the Unsplash images CDN, used only as local editing/evaluation fixtures. They are **not CC0**. The applicable public license is the [Unsplash License](https://unsplash.com/license), with [Terms](https://unsplash.com/terms). It permits downloading/copying/modifying photos, including commercial use without mandatory attribution; it does not grant a right to compile a competing photo service or imply endorsement. No identity, ethnicity, medical diagnosis, endorsement or model-training permission is inferred here.

- `originals/portrait-a.jpg`: https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=768&q=90&fit=max
- `originals/portrait-b.jpg`: https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=768&q=90&fit=max
- `originals/portrait-c.jpg`: https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=768&q=90&fit=max

Original SHA256 hashes and dimensions are generated in `photo-metrics.json`. Before/after PNGs are derivatives of the corresponding originals. The two-person case is explicitly a side-by-side composite, not an original shared-scene group photograph. Region annotations were manually specified by the implementing AI for reproducible evaluation; they are not model predictions, and they do **not** count as human acceptance.

The CDN downloads returned HTTP 200. Attempts to save the live license and terms pages returned HTTP 401 in this session; this file records the public license link and its standard permission rather than claiming a fresh license-page snapshot. Public-domain Wikimedia/GitHub sources were attempted first but failed transport/timeouts. Confirm photographer/source attribution and current license before publishing these assets outside this workspace. The task remains blocked for actual human review and additional representative cases; it is not marked accepted on these samples.
