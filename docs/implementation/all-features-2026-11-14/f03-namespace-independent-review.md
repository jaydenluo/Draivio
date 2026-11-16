# Export namespace repair review

Task 86334889-4f25-4c1d-8f34-afdb937b29fd, same-scope repair. Real React CanvasScene DOM exposed duplicate xmlns through serializeEditorSvg → serializeExport → Resvg. Previous string fixtures did not represent React DOM namespaces.

Independent inspection confirms plain xmlns is removed and replaced by a proper XMLNS namespace declaration; element namespace is retained. No export bypass. New true CanvasScene DOM regression checks XML parse success and Resvg output: 20×10 canvas red left/white right; isolated layer red left/transparent right; 10×10 selection red pixels. Existing layer/selection serialization retained. Worker first reproduced duplicate xmlns.

Independent checks: serializeExport.test + serializeExport.dom.test + ExportDialog.test + exportImage.test passed; npm run build and vibeplan check exit 0. Initial worker build was blocked by an unrelated unsupported test option in A11; A11 worker removed it and build was rerun successfully. A11 remains unfinished and its failing pending integration tests are not claimed as export validation.
