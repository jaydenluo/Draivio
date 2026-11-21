/* Production one-job worker. No paths or pixel buffers cross the WebView IPC.
 * Exit codes: 64 invalid request, 65 invalid image, 66 unsupported precision,
 * 67 metadata/input budget, 70 runtime. Host owns staging and publication. */
#include <vips/vips.h>
#include <glib/gstdio.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#ifndef _WIN32
#include <sys/resource.h>
#endif
static volatile gint warned=0;
static void warning_log(const gchar *domain,GLogLevelFlags level,const gchar *message,gpointer data) { (void)domain;(void)level;(void)message;(void)data;g_atomic_int_set(&warned,1); }
static int number(const char *s,int lo,int hi,int *out) {
 if(!s||!*s) return -1; for(const char *p=s;*p;p++) if(*p<'0'||*p>'9') return -1;
 errno=0; char *end; unsigned long n=strtoul(s,&end,10);
 if(errno||*end||n<(unsigned)lo||n>(unsigned)hi) return -1; *out=(int)n;return 0;
}
static int metadata_budget(VipsImage *in) {
 char **fields=vips_image_get_fields(in); size_t total=0;
 for(int i=0;fields&&fields[i];i++) { GValue value=G_VALUE_INIT;
  if(vips_image_get(in,fields[i],&value)) {g_strfreev(fields);return -1;}
  if(G_VALUE_TYPE(&value)==VIPS_TYPE_BLOB) { size_t n=0;vips_value_get_blob(&value,&n);if(n>4*1024*1024||total>4*1024*1024-n){g_value_unset(&value);g_strfreev(fields);return -1;}total+=n; }
  g_value_unset(&value);
 }g_strfreev(fields);return 0;
}
static int run_worker(int argc,char **argv) {
 if(argc==2&&!strcmp(argv[1],"capabilities")) {
  if(VIPS_INIT(argv[0]))return 70;
  if(!vips_type_find("VipsOperation","jpegload_source")||!vips_type_find("VipsOperation","pngload_source")||!vips_type_find("VipsOperation","tiffload_source")){vips_shutdown();return 70;}
  printf("{\"protocolVersion\":1,\"workingSampleType\":\"u8\",\"formats\":[\"jpeg\",\"png\",\"tiff\"],\"runtimeVersion\":\"%s\",\"decodersAvailable\":true}",vips_version_string());vips_shutdown();return 0;
 }
 if(argc<4) return 64;
 const char *op=argv[1];int edge=0;
 if(strcmp(op,"probe")&&strcmp(op,"preview")&&strcmp(op,"cache"))return 64;
 if(!strcmp(op,"preview")){if(argc!=5||number(argv[4],1,4096,&edge))return 64;}else if(argc!=4)return 64;
 GStatBuf st;if(g_stat(argv[2],&st)||!S_ISREG(st.st_mode)||st.st_size<=0||st.st_size>16LL*1024*1024*1024)return 67;
#ifndef _WIN32
 /* Limits complement host deadlines/quotas; RLIMIT_AS is not reliable on macOS. */
 struct rlimit disk={8ULL*1024*1024*1024,8ULL*1024*1024*1024};setrlimit(RLIMIT_FSIZE,&disk);
 struct rlimit cpu={120,120};setrlimit(RLIMIT_CPU,&cpu);
#endif
 if(VIPS_INIT(argv[0]))return 70;
 g_log_set_handler("VIPS",G_LOG_LEVEL_WARNING,warning_log,NULL);
 vips_concurrency_set(2);vips_cache_set_max_mem(64*1024*1024);vips_cache_set_max(0);
 VipsSource *source=vips_source_new_from_file(argv[2]);VipsImage *in=NULL,*out=NULL,*display=NULL;int rc=65;
 if(!source)goto done;
 /* Source loader avoids libvips filename [options] parsing for user-selected names. */
 const char *loader=vips_foreign_find_load_source(source);
 if(!loader||(!strstr(loader,"Jpeg")&&!strstr(loader,"Png")&&!strstr(loader,"Tiff")))goto done;
 in=vips_image_new_from_source(source,"","access",VIPS_ACCESS_SEQUENTIAL,"fail_on",VIPS_FAIL_ON_TRUNCATED,NULL);
 if(!in)goto done;
 int pages=1,orientation=1;
 if(vips_image_get_typeof(in,"n-pages"))vips_image_get_int(in,"n-pages",&pages);
 if(vips_image_get_typeof(in,"orientation"))vips_image_get_int(in,"orientation",&orientation);
 if(in->Xsize<=0||in->Ysize<=0||(guint64)in->Xsize*in->Ysize>1000000000ULL||pages!=1||orientation<1||orientation>8||metadata_budget(in)){rc=67;goto done;}
 const char *sample=in->BandFmt==VIPS_FORMAT_UCHAR?"u8":in->BandFmt==VIPS_FORMAT_USHORT?"u16":in->BandFmt==VIPS_FORMAT_FLOAT?"f32":"unsupported";
 gboolean editable=in->BandFmt==VIPS_FORMAT_UCHAR&&(in->Type==VIPS_INTERPRETATION_sRGB||in->Type==VIPS_INTERPRETATION_RGB||in->Type==VIPS_INTERPRETATION_B_W)&&(in->Bands>=1&&in->Bands<=4);
 const void *profile=NULL;size_t profile_bytes=0;gchar *hash=NULL;
 if(vips_image_get_typeof(in,VIPS_META_ICC_NAME)) {if(vips_image_get_blob(in,VIPS_META_ICC_NAME,&profile,&profile_bytes)||profile_bytes>1024*1024){rc=67;goto done;}hash=g_compute_checksum_for_data(G_CHECKSUM_SHA256,profile,profile_bytes);}
 if(!strcmp(op,"probe")) {
  if(profile_bytes&&!g_file_set_contents(argv[3],profile,profile_bytes,NULL)){g_free(hash);goto done;}
  printf("{\"width\":%d,\"height\":%d,\"bands\":%d,\"sampleType\":\"%s\",\"orientation\":%d,\"pages\":%d,\"format\":\"%s\",\"editingSupported\":%s,\"profileHash\":",in->Xsize,in->Ysize,in->Bands,sample,orientation,pages,strstr(loader,"Jpeg")?"jpeg":strstr(loader,"Png")?"png":"tiff",editable?"true":"false");
  if(hash)printf("\"%s\"",hash);else printf("null");printf("}");rc=0;
 }else if(!editable){rc=66;
 }else if(!strcmp(op,"cache")) {
  rc=vips_tiffsave(in,argv[3],"tile",TRUE,"tile_width",512,"tile_height",512,"pyramid",TRUE,"compression",VIPS_FOREIGN_TIFF_COMPRESSION_DEFLATE,"bigtiff",TRUE,NULL)?65:0;
 }else {
  /* Thumbnail applies EXIF orientation. Its dimensions are display-only. */
  VipsSource *thumb_source=vips_source_new_from_file(argv[2]);
  rc=(!thumb_source||vips_thumbnail_source(thumb_source,&out,edge,"height",edge,"size",VIPS_SIZE_DOWN,"fail_on",VIPS_FAIL_ON_TRUNCATED,"export_profile","srgb",NULL))?65:0;
  if(thumb_source)g_object_unref(thumb_source);
  if(!rc)rc=vips_colourspace(out,&display,VIPS_INTERPRETATION_sRGB,NULL)?65:0;
  if(!rc)rc=vips_pngsave(display,argv[3],NULL)?65:0;
  if(!rc)printf("{\"width\":%d,\"height\":%d}",display->Xsize,display->Ysize);
 }
 g_free(hash);
 done:
 if(g_atomic_int_get(&warned))rc=65;
 if(rc)fprintf(stderr,"image worker rejected operation (%d)\n",rc);
 if(display)g_object_unref(display);if(out)g_object_unref(out);if(in)g_object_unref(in);if(source)g_object_unref(source);vips_shutdown();return rc;
}

#ifdef _WIN32
int wmain(int argc, wchar_t **argv) {
 char **utf8 = g_new0(char *, argc + 1);
 for (int index = 0; index < argc; index++) {
  utf8[index] = g_utf16_to_utf8((const gunichar2 *)argv[index], -1, NULL, NULL, NULL);
  if (!utf8[index]) {
   g_strfreev(utf8);
   return 64;
  }
 }
 int result = run_worker(argc, utf8);
 g_strfreev(utf8);
 return result;
}
#else
int main(int argc, char **argv) {
 return run_worker(argc, argv);
}
#endif
