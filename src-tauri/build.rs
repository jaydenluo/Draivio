fn main() {
  println!("cargo:rerun-if-changed=native/ocr.swift");
  if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
    let output = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("draivio-vision");
    let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
    let target = if arch == "aarch64" { "arm64-apple-macosx12.0" } else { "x86_64-apple-macosx12.0" };
    let status = std::process::Command::new("xcrun").args(["swiftc", "native/ocr.swift", "-O", "-target", target, "-o"]).arg(&output).status().expect("Apple Swift compiler required for macOS OCR");
    assert!(status.success(), "Apple Vision OCR helper compilation failed");
  }
  tauri_build::build()
}
