import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HistogramPanel } from './HistogramPanel'
it('shows transparent sample count, selection sample count and preview-only clipping warning',()=>{const pixels=new Uint8ClampedArray([0,0,0,255,255,255,255,255,20,30,40,0,100,100,100,255]);const {rerender}=render(<HistogramPanel pixels={pixels} width={2} height={2} revision={1}/>);expect(screen.getByText(/样本 3/)).toBeInTheDocument();expect(screen.getByText(/透明 1/)).toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('剪裁');rerender(<HistogramPanel pixels={pixels} width={2} height={2} options={{selection:{x:1,y:0,width:1,height:1}}} revision={2}/>);expect(screen.getByText(/样本 1/)).toBeInTheDocument()})
