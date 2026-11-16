import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { TOOL_GROUPS } from '../tools/toolRegistry'
import { ToolIcon } from './ToolIcon'

test('provides a visible SVG icon for every registered tool', () => {
  const tools = TOOL_GROUPS.flatMap((group) => group.tools)
  render(<div>{tools.map((tool) => <ToolIcon key={tool.id} toolId={tool.id} />)}</div>)

  expect(document.querySelectorAll('.tool-icon')).toHaveLength(tools.length)
})
