/* LI02 isolated native FFI probe, not linked into the application. */
#include <vips/vips.h>
#include <sys/resource.h>
#include <time.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static double now(void) { struct timespec t; clock_gettime(CLOCK_MONOTONIC,&t); return t.tv_sec+t.tv_nsec/1e9; }
int main(int argc,char **argv) {
 if(argc<3) return 64;
 double start=now();
 if(VIPS_INIT(argv[0])) { vips_error_exit(NULL); }
 vips_concurrency_set(2); vips_cache_set_max_mem(64*1024*1024); vips_cache_set_max(0);
 const char *op=argv[1], *source=argv[2];
 const char *loader=vips_foreign_find_load(source);
 if(!loader || (!strstr(loader,"Jpeg") && !strstr(loader,"Png") && !strstr(loader,"Tiff"))) { fprintf(stderr,"unsupported loader: %s\n",loader?loader:"none"); vips_shutdown(); return 65; }
 fprintf(stderr,"LI_STARTED native-operation\n");
 VipsImage *in=NULL,*out=NULL; int rc=0;
 if(strcmp(op,"thumbnail")==0) {
  if(argc!=5) return 64;
  rc=vips_thumbnail(source,&out,atoi(argv[4]),"height",atoi(argv[4]),"size",VIPS_SIZE_DOWN,"fail_on",VIPS_FAIL_ON_TRUNCATED,NULL);
  if(!rc) rc=vips_pngsave(out,argv[3],NULL);
 } else {
  if(strcmp(op,"metadata-loop")==0) {
   for(int n=0;n<99;n++) { VipsImage *probe=vips_image_new_from_file(source,"access",VIPS_ACCESS_RANDOM,"fail_on",VIPS_FAIL_ON_TRUNCATED,NULL); if(!probe) {rc=-1;goto done;} volatile int width=probe->Xsize; (void)width; g_object_unref(probe); }
  }
  in=vips_image_new_from_file(source,"access",strcmp(op,"cache")==0||strcmp(op,"export")==0?VIPS_ACCESS_SEQUENTIAL:VIPS_ACCESS_RANDOM,"fail_on",VIPS_FAIL_ON_TRUNCATED,NULL);
  if(!in) rc=-1;
  else if((strcmp(op,"metadata")==0 || strcmp(op,"metadata-loop")==0)) {
   int orientation=1; if(vips_image_get_typeof(in,"orientation")) vips_image_get_int(in,"orientation",&orientation);
   printf("{\"width\":%d,\"height\":%d,\"bands\":%d,\"format\":\"%s\",\"interpretation\":\"%s\",\"orientation\":%d,\"icc\":%s}",in->Xsize,in->Ysize,in->Bands,vips_enum_nick(VIPS_TYPE_BAND_FORMAT,in->BandFmt),vips_enum_nick(VIPS_TYPE_INTERPRETATION,in->Type),orientation,vips_image_get_typeof(in,VIPS_META_ICC_NAME)?"true":"false");
  } else if(strcmp(op,"region")==0) {
   if(in->BandFmt!=VIPS_FORMAT_UCHAR && in->BandFmt!=VIPS_FORMAT_USHORT) { vips_error("region","PNG working region requires uchar/ushort; float uses TIFF/native typed region sink"); rc=-1; goto done; }
   if(argc!=8) return 64;
   rc=vips_extract_area(in,&out,atoi(argv[4]),atoi(argv[5]),atoi(argv[6]),atoi(argv[7]),NULL);
   if(!rc) rc=vips_pngsave(out,argv[3],NULL);
  } else if(strcmp(op,"cache")==0) {
   if(argc!=5) return 64;
   int tile=atoi(argv[4]);
   rc=vips_tiffsave(in,argv[3],"tile",TRUE,"tile_width",tile,"tile_height",tile,"pyramid",TRUE,"compression",VIPS_FOREIGN_TIFF_COMPRESSION_DEFLATE,"bigtiff",TRUE,NULL);
  } else if(strcmp(op,"export")==0) {
   if(in->BandFmt!=VIPS_FORMAT_UCHAR && in->BandFmt!=VIPS_FORMAT_USHORT) { vips_error("export","PNG export requires uchar/ushort; high-depth float conversion must be explicit"); rc=-1; goto done; }
   if(argc!=4) return 64;
   rc=vips_pngsave(in,argv[3],NULL);
  } else rc=-1;
 }
 done:
 if(rc) fprintf(stderr,"%s",vips_error_buffer());
 struct rusage u; getrusage(RUSAGE_SELF,&u);
#ifdef __APPLE__
 long long rss=u.ru_maxrss;
#else
 long long rss=(long long)u.ru_maxrss*1024;
#endif
 fprintf(stderr,"\nLI_METRICS {\"nativeMs\":%.3f,\"maxRssBytes\":%lld,\"inputBlocks\":%ld,\"outputBlocks\":%ld,\"vipsVersion\":\"%s\"}\n",(now()-start)*1000,rss,u.ru_inblock,u.ru_oublock,vips_version_string());
 if(out) g_object_unref(out); if(in) g_object_unref(in); vips_shutdown(); return rc?1:0;
}
