//! ICC engine: moxcms 0.8.1, BSD-3-Clause OR Apache-2.0.
use moxcms::{ColorProfile, DataColorSpace, Layout, RenderingIntent, TransformOptions};
fn parse(bytes: &[u8]) -> Result<ColorProfile,String> {
 if bytes.len()<132 || bytes.len()>4*1024*1024 {return Err("ICC 配置文件尺寸无效（最大 4MB）".into())}
 let p=ColorProfile::new_from_slice(bytes).map_err(|e|format!("ICC 配置文件无法解析：{e}"))?;
 if p.color_space!=DataColorSpace::Rgb {return Err("仅支持 RGB ICC 配置文件".into())} Ok(p)
}
#[tauri::command]
pub fn transform_rgba_icc(pixels: Vec<u8>, width:u32, height:u32, source_profile:Vec<u8>, destination_profile:Vec<u8>, intent:String)->Result<Vec<u8>,String>{
 let n=(width as usize).checked_mul(height as usize).filter(|n|*n>0&&*n<=32_000_000).ok_or("像素尺寸无效")?;
 if pixels.len()!=n*4{return Err("像素尺寸不匹配".into())}
 let src=parse(&source_profile)?;let dst=parse(&destination_profile)?;
 let rendering_intent=match intent.as_str(){"perceptual"=>RenderingIntent::Perceptual,"relative-colorimetric"=>RenderingIntent::RelativeColorimetric,"saturation"=>RenderingIntent::Saturation,"absolute-colorimetric"=>RenderingIntent::AbsoluteColorimetric,_=>return Err("渲染意图无效".into())};
 let tr=src.create_transform_8bit(Layout::Rgba,&dst,Layout::Rgba,TransformOptions{rendering_intent,..Default::default()}).map_err(|e|format!("ICC 转换不可用：{e}"))?;
 let mut out=vec![0;n*4];tr.transform(&pixels,&mut out).map_err(|e|format!("ICC 像素转换失败：{e}"))?;
 for (a,b) in pixels.chunks_exact(4).zip(out.chunks_exact_mut(4)){b[3]=a[3];if a[3]==0{b.copy_from_slice(a)}} Ok(out)
}
#[cfg(test)] mod tests{use super::*;
 #[test] fn transforms_real_profiles_all_intents_preserving_alpha(){
 let src=ColorProfile::new_srgb().encode().unwrap();let dst=ColorProfile::new_display_p3().encode().unwrap();
 for intent in ["perceptual","relative-colorimetric","saturation","absolute-colorimetric"]{
 let out=transform_rgba_icc(vec![255,0,0,128,100,5,9,0],2,1,src.clone(),dst.clone(),intent.into()).unwrap();
 assert!((out[0] as i32-234).abs()<=2);assert!((out[1] as i32-51).abs()<=3);assert!((out[2] as i32-35).abs()<=3);assert_eq!(out[3],128);assert_eq!(&out[4..],&[100,5,9,0]);
 }
 }
 #[test] fn rejects_bad_profile_and_intent(){assert!(parse(&[0;132]).is_err());assert!(transform_rgba_icc(vec![0;3],1,1,vec![],vec![],"bad".into()).is_err());}
}
