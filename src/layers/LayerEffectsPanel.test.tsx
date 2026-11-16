import {useState} from 'react'
import {fireEvent,render,screen} from '@testing-library/react'
import {expect,it} from 'vitest'
import {LayerEffectsPanel} from './LayerEffectsPanel'
import type {LayerEffects} from '../render/layerEffects'
it('adds toggles resets copies and pastes real styles',()=>{function Harness(){const[e,set]=useState<LayerEffects>({version:1,items:[]});return <><LayerEffectsPanel effects={e} disabled={false} onChange={set}/><output>{JSON.stringify(e)}</output></>};render(<Harness/>);fireEvent.click(screen.getByText('添加效果'));expect(screen.getByLabelText('投影启用')).toBeChecked();fireEvent.click(screen.getByText('复制样式'));fireEvent.click(screen.getByText('删除投影'));expect(screen.queryByLabelText('投影启用')).toBeNull();fireEvent.click(screen.getByText('粘贴样式'));fireEvent.click(screen.getByLabelText('投影启用'));expect(screen.getByLabelText('投影启用')).not.toBeChecked();fireEvent.click(screen.getByText('重置投影'));expect(screen.getByLabelText('投影启用')).toBeChecked()})
