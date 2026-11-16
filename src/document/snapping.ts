export type SnapPoint = { x: number; y: number; source: 'object-edge'|'object-center'|'canvas-edge'|'canvas-center'|'guide'|'grid'; priority: number; axis: 'x'|'y' }
export type SnapConfig = { enabled?: boolean; gridEnabled?: boolean; gridSize?: number; thresholdPx?: number; zoom?: number; guides?: { axis:'x'|'y'; position:number; locked?:boolean }[] }
export type SnapInput = { rect:{x:number;y:number;width:number;height:number}; canvas:{width:number;height:number}; config?:SnapConfig; altKey?:boolean }
export type SnapResult = { rect:SnapInput['rect']; x?:SnapPoint; y?:SnapPoint }
const candidates = (value:number, target:number, source:SnapPoint['source'], priority:number, axis:SnapPoint['axis'], threshold:number):SnapPoint|undefined => Math.abs(value-target)<=threshold ? {x:axis==='x'?target:0,y:axis==='y'?target:0,source,priority,axis}:undefined
export function snapRect(input:SnapInput):SnapResult {
  const { rect, canvas, altKey } = input; const config=input.config??{}; if (altKey || config.enabled===false) return {rect:{...rect}}
  const threshold=(config.thresholdPx??6)/Math.max(.01,config.zoom??1); const xs:[number, SnapPoint['source'], number][]=[[0,'canvas-edge',1],[canvas.width,'canvas-edge',1],[canvas.width/2,'canvas-center',2]]; const ys:[number,SnapPoint['source'],number][]=[[0,'canvas-edge',1],[canvas.height,'canvas-edge',1],[canvas.height/2,'canvas-center',2]]
  for(const g of config.guides??[]) (g.axis==='x'?xs:ys).push([g.position,'guide',0])
  if(config.gridEnabled!==false && (config.gridSize??0)>0){const size=config.gridSize!; xs.push([Math.round(rect.x/size)*size,'grid',3],[Math.round((rect.x+rect.width)/size)*size,'grid',3]); ys.push([Math.round(rect.y/size)*size,'grid',3],[Math.round((rect.y+rect.height)/size)*size,'grid',3])}
  const test=(axis:'x'|'y', values:number[], list:typeof xs) => {let best:SnapPoint|undefined; for(const value of values) for(const [target,source,priority] of list){const p=candidates(value,target,source,priority,axis,threshold); if(p&&(!best||p.priority<best.priority||p.priority===best.priority&&Math.abs(value-target)<Math.abs((axis==='x'?best.x:best.y)-target))) best=p} return best}
  const x=test('x',[rect.x,rect.x+rect.width,rect.x+rect.width/2],xs), y=test('y',[rect.y,rect.y+rect.height,rect.y+rect.height/2],ys); const next={...rect}; if(x) next.x += x.x-(Math.abs(rect.x-(x.x))<Math.abs(rect.x+rect.width-x.x)?rect.x:rect.x+rect.width); if(y) next.y += y.y-(Math.abs(rect.y-y.y)<Math.abs(rect.y+rect.height-y.y)?rect.y:rect.y+rect.height); return {rect:next,x,y}
}
