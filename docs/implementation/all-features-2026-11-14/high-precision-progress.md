# High precision repair checkpoint

Native PNG16/TIFF16/EXR32f codecs and original typed project resources are implemented. Fresh repairs preserve explicit sRGB/linear encoding and original integer samples, use shared feather/inverse mask alpha, and reject unsupported visible attached vector/text/brush scene contents.

The earlier 4096 CPU-only throughput probe omitted serialization/IPC overhead and does not establish a safe end-to-end budget. Current implementation conservatively caps raw/transport resources at32MiB and reserves16 raw-buffer equivalents for processing/transport.4096-square16/32-bit assets reject before pixelbuffer allocation; measured allocation/RSS evidence is in /tmp/f30-repair-report.json. Project aggregate resources are preflighted before cloning, transient undo/redo histories excluded. ICC-tagged high-precision imports explicitly reject.

Repair worker47 frontend tests and4 native tests passed. Main independently reran11files47tests, exit0 (/tmp/f30-root-repair-verified.log). Fresh independent review of all5 criteria is still required before acceptance. These limits must remain visible; no claim that every4096 operation or arbitrary mixed scene is supported.

Fresh independent review /tmp/f30-independent-review-final.json passed all5criteria after own47tests/native4tests/4newprobes. Accepted cloud donev23 after主控47tests/all20native/build/check. Limits above remain part of delivery.
