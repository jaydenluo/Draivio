import type {AIResult} from '../state/editor'
import {createDocumentSession} from '../document/documentWorkspace'
import {resultDimensions} from './resultImage'

export function createResultDocument(result:AIResult){
 if(result.status!=='success'||!result.source)throw new Error('结果图片尚不可用')
 const size=resultDimensions(result.source),session=createDocumentSession(`AI 图片 · ${result.model}`,size)
 const layer={id:crypto.randomUUID(),kind:'image' as const,name:'生成图片',className:'layer-art',source:result.source,thumbnail:result.thumbnail,contentWidth:size.width,contentHeight:size.height,visible:true,opacity:100,blendMode:'正常',aiOperation:result.request}
 session.state={...session.state,layers:[layer],selectedLayerId:layer.id,selectedLayerIds:[layer.id],aiResults:[{...result,size:`${size.width} × ${size.height}`,adopted:true}],artboards:session.state.artboards.map(board=>({...board,layerIds:[layer.id]}))}
 return session
}
