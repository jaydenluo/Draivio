//! Native high precision transport: original typed samples never pass through RGBA8.

use base64::{Engine, engine::general_purpose::STANDARD};
use image::{DynamicImage, ImageBuffer, ImageDecoder, ImageFormat, ImageReader, Rgba};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

const MAX_BYTES: usize = 32 * 1024 * 1024;
const MAX_SIDE: u32 = 16_384;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct PrecisionRaster {
    pub width: u32,
    pub height: u32,
    pub format: String,
    /// Base64 encoded tightly packed RGBA samples, explicitly little endian.
    pub data: String,
    #[serde(default = "linear_encoding")]
    pub encoding: String,
}

fn linear_encoding() -> String {
    "linear".into()
}

fn codec_format(codec: &str) -> Result<ImageFormat, String> {
    match codec {
        "png16" => Ok(ImageFormat::Png),
        "tiff16" => Ok(ImageFormat::Tiff),
        "exr32f" => Ok(ImageFormat::OpenExr),
        _ => Err("不支持的高精度文件格式".into()),
    }
}

fn bounded_len(width: u32, height: u32, bytes_per_sample: usize) -> Result<usize, String> {
    if width == 0 || height == 0 || width > MAX_SIDE || height > MAX_SIDE {
        return Err("高精度图像尺寸超出 1–16384 像素范围".into());
    }
    (width as usize)
        .checked_mul(height as usize)
        .and_then(|n| n.checked_mul(4 * bytes_per_sample))
        .filter(|n| *n <= MAX_BYTES)
        .ok_or_else(|| "高精度资源超出 32 MiB 预算".into())
}

fn decode_base64(data: &str) -> Result<Vec<u8>, String> {
    if data.len() > MAX_BYTES.div_ceil(3) * 4 {
        return Err("高精度资源超出传输预算".into());
    }
    let bytes = STANDARD
        .decode(data)
        .map_err(|_| "高精度资源 Base64 无效")?;
    if bytes.len() > MAX_BYTES {
        return Err("高精度资源超出传输预算".into());
    }
    Ok(bytes)
}

pub fn encode_precision(raster: &PrecisionRaster, codec: &str) -> Result<String, String> {
    let file_format = codec_format(codec)?;
    let sample_bytes = match (raster.format.as_str(), codec) {
        ("rgba16", "png16" | "tiff16") => 2,
        ("rgba32f", "exr32f") => 4,
        _ => return Err("导出格式与原始位深不兼容，请显式转换后导出".into()),
    };
    if (codec == "exr32f" && raster.encoding != "linear")
        || (codec != "exr32f" && raster.encoding != "srgb")
    {
        return Err("文件颜色编码不匹配；请先显式转换为 sRGB 整数或线性 EXR".into());
    }
    let expected = bounded_len(raster.width, raster.height, sample_bytes)?;
    let bytes = decode_base64(&raster.data)?;
    if bytes.len() != expected {
        return Err("高精度资源长度与尺寸不匹配".into());
    }
    let image = if sample_bytes == 2 {
        let samples = bytes
            .chunks_exact(2)
            .map(|c| u16::from_le_bytes([c[0], c[1]]))
            .collect();
        DynamicImage::ImageRgba16(
            ImageBuffer::<Rgba<u16>, _>::from_raw(raster.width, raster.height, samples)
                .ok_or("高精度资源尺寸无效")?,
        )
    } else {
        let samples: Vec<f32> = bytes
            .chunks_exact(4)
            .map(|c| f32::from_le_bytes(c.try_into().unwrap()))
            .collect();
        if samples.iter().any(|v| !v.is_finite()) {
            return Err("浮点资源包含非有限数值".into());
        }
        DynamicImage::ImageRgba32F(
            ImageBuffer::<Rgba<f32>, _>::from_raw(raster.width, raster.height, samples)
                .ok_or("高精度资源尺寸无效")?,
        )
    };
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, file_format)
        .map_err(|e| format!("高精度编码失败：{e}"))?;
    if output.get_ref().len() > MAX_BYTES {
        return Err("编码结果超出传输预算".into());
    }
    Ok(STANDARD.encode(output.into_inner()))
}

pub fn decode_precision(encoded: &str, codec: &str) -> Result<PrecisionRaster, String> {
    let file_format = codec_format(codec)?;
    let bytes = decode_base64(encoded)?;
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(MAX_SIDE);
    limits.max_image_height = Some(MAX_SIDE);
    limits.max_alloc = Some(MAX_BYTES as u64);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), file_format);
    reader.limits(limits.clone());
    let mut decoder = reader
        .into_decoder()
        .map_err(|e| format!("高精度文件无效：{e}"))?;
    decoder
        .set_limits(limits)
        .map_err(|e| format!("高精度文件超出预算：{e}"))?;
    let (width, height) = decoder.dimensions();
    bounded_len(width, height, if codec == "exr32f" { 4 } else { 2 })?;
    if decoder
        .icc_profile()
        .map_err(|e| format!("ICC 配置读取失败：{e}"))?
        .is_some()
    {
        return Err("暂不支持内嵌 ICC 配置的高精度文件；请先转换为标准 sRGB/线性 EXR".into());
    }
    let original_type = decoder.color_type();
    let image = DynamicImage::from_decoder(decoder).map_err(|e| format!("高精度解码失败：{e}"))?;
    let (format, data) = match codec {
        "png16" | "tiff16"
            if matches!(
                original_type,
                image::ColorType::L16
                    | image::ColorType::La16
                    | image::ColorType::Rgb16
                    | image::ColorType::Rgba16
            ) =>
        {
            (
                "rgba16",
                image
                    .to_rgba16()
                    .into_raw()
                    .iter()
                    .flat_map(|v| v.to_le_bytes())
                    .collect::<Vec<_>>(),
            )
        }
        "exr32f"
            if matches!(
                original_type,
                image::ColorType::Rgb32F | image::ColorType::Rgba32F
            ) =>
        {
            let samples = image.to_rgba32f().into_raw();
            if samples.iter().any(|v| !v.is_finite()) {
                return Err("浮点资源包含非有限数值".into());
            }
            (
                "rgba32f",
                samples
                    .iter()
                    .flat_map(|v| v.to_le_bytes())
                    .collect::<Vec<_>>(),
            )
        }
        _ => return Err("文件真实位深与所选高精度格式不匹配".into()),
    };
    Ok(PrecisionRaster {
        width,
        height,
        format: format.into(),
        encoding: if codec == "exr32f" { "linear" } else { "srgb" }.into(),
        data: STANDARD.encode(data),
    })
}

#[tauri::command]
pub async fn image_decode_precision(
    encoded: String,
    codec: String,
) -> Result<PrecisionRaster, String> {
    tauri::async_runtime::spawn_blocking(move || decode_precision(&encoded, &codec))
        .await
        .map_err(|_| "高精度解码工作线程失败".to_string())?
}

#[tauri::command]
pub async fn image_encode_precision(
    raster: PrecisionRaster,
    codec: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || encode_precision(&raster, &codec))
        .await
        .map_err(|_| "高精度编码工作线程失败".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::{Engine, engine::general_purpose::STANDARD};
    use image::{ColorType, ImageDecoder, ImageReader};
    use std::io::Cursor;

    fn raster16() -> PrecisionRaster {
        let values: [u16; 12] = [
            1, 12345, 65534, 65535, 257, 23456, 45678, 32768, 65535, 0, 1023, 65535,
        ];
        PrecisionRaster {
            width: 3,
            height: 1,
            format: "rgba16".into(),
            encoding: "srgb".into(),
            data: STANDARD.encode(
                values
                    .iter()
                    .flat_map(|v| v.to_le_bytes())
                    .collect::<Vec<_>>(),
            ),
        }
    }

    #[test]
    fn png_and_tiff_preserve_real_sixteen_bit_samples() {
        let input = raster16();
        for codec in ["png16", "tiff16"] {
            let encoded = encode_precision(&input, codec).unwrap();
            let bytes = STANDARD.decode(&encoded).unwrap();
            let decoder =
                ImageReader::with_format(Cursor::new(&bytes), codec_format(codec).unwrap())
                    .into_decoder()
                    .unwrap();
            assert_eq!(decoder.color_type(), ColorType::Rgba16);
            let mut independent = vec![0; decoder.total_bytes() as usize];
            decoder.read_image(&mut independent).unwrap();
            let independent_values: Vec<u16> = independent
                .chunks_exact(2)
                .map(|v| u16::from_ne_bytes([v[0], v[1]]))
                .collect();
            assert_eq!(
                independent_values,
                [
                    1, 12345, 65534, 65535, 257, 23456, 45678, 32768, 65535, 0, 1023, 65535
                ]
            );
            let decoded = decode_precision(&encoded, codec).unwrap();
            assert_eq!(decoded.data, input.data);
            assert_eq!(decoded.encoding, "srgb");
        }
    }

    #[test]
    fn exr_preserves_float32_highlights_and_negative_scene_values() {
        let values = [2.5_f32, 1.125, -0.25, 1.0, 0.1234567, 32.0, 0.0, 0.5];
        let input = PrecisionRaster {
            width: 2,
            height: 1,
            format: "rgba32f".into(),
            encoding: "linear".into(),
            data: STANDARD.encode(
                values
                    .iter()
                    .flat_map(|v| v.to_le_bytes())
                    .collect::<Vec<_>>(),
            ),
        };
        let encoded = encode_precision(&input, "exr32f").unwrap();
        let bytes = STANDARD.decode(&encoded).unwrap();
        let decoder = ImageReader::with_format(Cursor::new(&bytes), image::ImageFormat::OpenExr)
            .into_decoder()
            .unwrap();
        assert_eq!(decoder.color_type(), ColorType::Rgba32F);
        let mut independent = vec![0; decoder.total_bytes() as usize];
        decoder.read_image(&mut independent).unwrap();
        let samples: Vec<f32> = independent
            .chunks_exact(4)
            .map(|v| f32::from_ne_bytes(v.try_into().unwrap()))
            .collect();
        assert_eq!(samples, values);
        assert_eq!(
            decode_precision(&encoded, "exr32f").unwrap().data,
            input.data
        );
    }

    #[test]
    fn rejects_embedded_icc_and_4096_transport_before_sample_allocation() {
        use image::ImageEncoder;
        let mut bytes = Vec::new();
        let mut encoder = image::codecs::png::PngEncoder::new(&mut bytes);
        encoder.set_icc_profile(vec![0; 128]).unwrap();
        encoder
            .write_image(&[0; 8], 1, 1, image::ExtendedColorType::Rgba16)
            .unwrap();
        assert!(
            decode_precision(&STANDARD.encode(bytes), "png16")
                .unwrap_err()
                .contains("ICC")
        );
        assert!(bounded_len(4096, 4096, 2).is_err());
        assert!(bounded_len(4096, 4096, 4).is_err());
    }

    #[test]
    fn rejects_wrong_depth_length_nonfinite_and_oversize_before_encoding() {
        assert!(encode_precision(&raster16(), "exr32f").is_err());
        let mut input = raster16();
        input.width = 16_385;
        assert!(encode_precision(&input, "png16").is_err());
        input.width = 4;
        assert!(encode_precision(&input, "png16").is_err());
        input.width = 1;
        input.format = "rgba32f".into();
        input.data = STANDARD.encode(
            [f32::NAN, 0.0, 0.0, 1.0]
                .iter()
                .flat_map(|v| v.to_le_bytes())
                .collect::<Vec<_>>(),
        );
        assert!(encode_precision(&input, "exr32f").is_err());
        assert!(decode_precision("bad data", "png16").is_err());
    }
}
