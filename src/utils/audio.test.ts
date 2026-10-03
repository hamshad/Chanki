import { describe, it, expect } from 'vitest'
import { chooseChineseVoice } from './audio'

function voice(name: string, lang: string, localService: boolean): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name } as SpeechSynthesisVoice
}

const localHuihui = voice('Microsoft Huihui Desktop', 'zh-CN', true)
const googleNetwork = voice('Google 普通话（中国大陆）', 'zh-CN', false)
const edgeLocalNatural = voice('Microsoft Xiaoxiao (Natural) - Chinese (Simplified, PRC)', 'zh-CN', true)
const edgeOnlineNatural = voice('Microsoft Yunxi Online (Natural) - Chinese (Simplified, PRC)', 'zh-CN', false)
const macTingting = voice('Tingting', 'zh-TW', true)
const english = voice('Google US English', 'en-US', false)

describe('chooseChineseVoice', () => {
  it('prefers network voices over bundled local ones', () => {
    expect(chooseChineseVoice([localHuihui, googleNetwork])).toBe(googleNetwork)
    expect(chooseChineseVoice([googleNetwork, localHuihui])).toBe(googleNetwork)
  })

  it('prefers vendor-labelled neural voices even when installed locally', () => {
    // Edge ships its Natural voices offline (localService true) and they beat
    // any network voice — the name marker outranks the network flag.
    expect(chooseChineseVoice([googleNetwork, edgeLocalNatural])).toBe(edgeLocalNatural)
    expect(chooseChineseVoice([edgeLocalNatural, localHuihui])).toBe(edgeLocalNatural)
    expect(chooseChineseVoice([edgeOnlineNatural, edgeLocalNatural])).toBe(edgeOnlineNatural)
  })

  it('falls back to plain local zh-CN when nothing better exists', () => {
    expect(chooseChineseVoice([macTingting, localHuihui])).toBe(localHuihui)
  })

  it('ignores non-Chinese voices', () => {
    expect(chooseChineseVoice([english])).toBeUndefined()
    expect(chooseChineseVoice([])).toBeUndefined()
  })
})
