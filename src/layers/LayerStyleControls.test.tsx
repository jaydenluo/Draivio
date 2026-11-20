import {useState} from 'react'
import {fireEvent,render,screen} from '@testing-library/react'
import {expect,it} from 'vitest'
import {LayerEffectControls} from './LayerEffectControls'
import {defaultEffect,type EffectKind} from '../render/layerEffects'
function Fixture({kind}:{kind:EffectKind}){const [e,set]=useState(defaultEffect(kind));return <><LayerEffectControls effect={e} onChange={patch=>set({...e,...patch})}/><output data-testid="effect">{JSON.stringify(e)}</output></>}
it('keeps numeric input and range synchronized, exposes angle and unit controls',()=>{
 render(<Fixture kind="shadow"/>);fireEvent.change(screen.getByRole('slider',{name:'投影距离滑杆'}),{target:{value:'30'}})
 expect(screen.getByRole('spinbutton',{name:'投影距离'})).toHaveValue(30)
 fireEvent.keyDown(screen.getByRole('slider',{name:'投影角度盘'}),{key:'ArrowRight'})
 expect(screen.getByRole('spinbutton',{name:'投影角度'})).toHaveValue(46)
 expect(screen.getAllByText('px').length).toBeGreaterThan(0)
})
it('edits visual gradient stops, reverse and type with add/delete bounds',()=>{
 render(<Fixture kind="gradientOverlay"/>)
 fireEvent.click(screen.getByRole('button',{name:'添加色标'}))
 expect(screen.getAllByRole('slider',{name:/色标 \d/})).toHaveLength(3)
 fireEvent.keyDown(screen.getByRole('slider',{name:'色标 2'}),{key:'ArrowRight'})
 expect(JSON.parse(screen.getByTestId('effect').textContent!).stops[1].offset).toBe(.51)
 fireEvent.click(screen.getByLabelText('反向渐变'))
 fireEvent.change(screen.getByLabelText('渐变类型'),{target:{value:'radial'}})
 expect(JSON.parse(screen.getByTestId('effect').textContent!)).toMatchObject({reverse:true,gradientType:'radial'})
 fireEvent.click(screen.getByRole('button',{name:'删除色标'}));expect(screen.getAllByRole('slider',{name:/色标 \d/})).toHaveLength(2)
 expect(screen.getByRole('button',{name:'删除色标'})).toBeDisabled()
})
