import { AppShell } from './AppShell'
import { EditorProvider } from '../state/editor'
import '../styles/theme.css'

export function App() { return <EditorProvider><AppShell /></EditorProvider> }
