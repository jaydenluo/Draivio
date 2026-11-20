import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { message } from '../ui/message'

afterEach(() => { cleanup(); message.destroy() })

beforeEach(() => window.localStorage.removeItem('draivio-generation-count'))

beforeEach(() => window.localStorage.removeItem('draivio-composer-preferences-v1'))

beforeEach(() => window.localStorage.removeItem('draivio-service-connections-v1'))
beforeEach(() => window.localStorage.removeItem('draivio-assistant-selection-v1'))
