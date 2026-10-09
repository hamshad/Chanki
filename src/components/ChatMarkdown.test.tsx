import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { ChatMarkdown } from './ChatMarkdown'

afterEach(cleanup)

const REPLY = `In Mandarin Chinese, "Right now, I am eating" is:

\`\`\`chinese
我现在正在吃饭。
Wǒ xiànzài zhèngzài chīfàn.
Right now, I am eating.
\`\`\`

### Word by word:

- 我 (wǒ) = I
- 现在 (xiànzài) = right now
- 正在 (zhèngzài) = currently
- 吃饭 (chīfàn) = to eat

### A more casual way to say it:

我在吃饭。
Wǒ zài chīfàn.

This means "I'm eating."

Tip: In Mandarin, **正在 (zhèngzài)** emphasizes right now.`

describe('ChatMarkdown', () => {
  it('renders the hanzi hero, pinyin and meaning lines', () => {
    const { container } = render(<ChatMarkdown text={REPLY} />)

    expect(container.querySelector('.chat-hanzi__hanzi')?.textContent).toBe('我现在正在吃饭。')
    const pinyin = container.querySelector('.chat-hanzi__pinyin')
    expect(pinyin?.textContent).toContain('Wǒ xiànzài zhèngzài chīfàn.')
    expect(pinyin?.textContent).toContain('Pinyin:')
    expect(container.querySelector('.chat-hanzi__meaning')?.textContent).toContain(
      'Right now, I am eating.',
    )
    // Tone colors per syllable.
    expect(container.querySelectorAll('.chat-hanzi [data-tone]').length).toBeGreaterThan(3)
  })

  it('renders headings, glossed bullets and bold inline', () => {
    const { container } = render(<ChatMarkdown text={REPLY} />)

    const headings = [...container.querySelectorAll('.chat-md__heading')].map((h) =>
      h.textContent,
    )
    expect(headings).toContain('Word by word:')
    expect(headings).toContain('A more casual way to say it:')

    const glosses = [...container.querySelectorAll('.chat-gloss__hanzi')].map((n) => n.textContent)
    expect(glosses).toEqual(['我', '现在', '正在', '吃饭'])
    expect(container.querySelector('.chat-gloss__meaning')?.textContent).toBe('I')
    const strong = [...container.querySelectorAll('.chat-md__strong')].map((n) => n.textContent)
    expect(strong).toContain('正在 (zhèngzài)')
  })

  // The mobile failure: no blank line before the heading or fence.
  it('keeps the layout when the model drops blank lines', () => {
    const tight = `In Mandarin Chinese, "I am eating" is:
\`\`\`chinese
我在吃饭。
Wǒ zài chīfàn.
I am eating.
\`\`\`
Word by word:
- 我 (wǒ) = I
- 吃饭 (chīfàn) = to eat
Tip: casual tone.`
    const { container } = render(<ChatMarkdown text={tight} />)

    expect(container.querySelector('.chat-hanzi__hanzi')?.textContent).toBe('我在吃饭。')
    expect(
      [...container.querySelectorAll('.chat-md__heading')].map((h) => h.textContent),
    ).toEqual(['Word by word', 'Tip: casual tone.'])
    expect(container.querySelectorAll('.chat-md__item')).toHaveLength(2)
    // Prose stays prose — not swallowed into the hanzi block.
    expect(container.querySelector('.chat-md__p')?.textContent).toContain(
      'In Mandarin Chinese',
    )
  })

  it('splits several fenced sentences in one block', () => {
    const { container } = render(
      <ChatMarkdown
        text={'```chinese\n你好。\nNǐ hǎo.\nHello.\n```\n\n```chinese\n谢谢。\nXièxie.\nThanks.\n```'}
      />,
    )
    const heroes = [...container.querySelectorAll('.chat-hanzi__hanzi')].map((n) => n.textContent)
    expect(heroes).toEqual(['你好。', '谢谢。'])
  })

  it('keeps a two-sentence fence together when the meaning follows', () => {
    const two = '```chinese\n你好。\nNǐ hǎo.\nHello.\n谢谢。\nXièxie.\nThanks.\n```'
    const { container } = render(<ChatMarkdown text={two} />)
    const heroes = [...container.querySelectorAll('.chat-hanzi__hanzi')].map((n) => n.textContent)
    expect(heroes).toEqual(['你好。', '谢谢。'])
  })

  it('falls back to prose for unformatted text and lone bullets', () => {
    const first = render(<ChatMarkdown text={'Just a line\nand another'} />)
    expect(first.container.querySelector('.chat-md__p')?.textContent).toBe(
      'Just a line\nand another',
    )
    cleanup()

    const { container } = render(<ChatMarkdown text={'- plain item\n- second item'} />)
    expect(container.querySelectorAll('.chat-md__item')).toHaveLength(2)
  })

  it('renders an unclosed fence rather than losing the text', () => {
    const { container } = render(
      <ChatMarkdown text={'```chinese\n你好。\nNǐ hǎo.\nHello.'} />,
    )
    expect(container.querySelector('.chat-hanzi__hanzi')?.textContent).toBe('你好。')
  })

  it('ignores the fence markers themselves', () => {
    const { container } = render(<ChatMarkdown text={'before\n```chinese\n吃。\nChī.\nEat.\n```\nafter'} />)
    expect(container.textContent).not.toContain('chinese')
    expect(container.textContent).toContain('before')
    expect(container.textContent).toContain('after')
  })
})