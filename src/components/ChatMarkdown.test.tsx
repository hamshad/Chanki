import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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
- 正在 (zhèngzài) = currently / in the middle of doing something
- 吃饭 (chīfàn) = to eat / have a meal

### A more casual way to say it:

我在吃饭。
Wǒ zài chīfàn.

This means "I'm eating."

Tip: In Mandarin, **正在 (zhèngzài)** emphasizes that the action is happening right now.`

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
    // Bold survives inline rendering.
    const strong = [...container.querySelectorAll('.chat-md__strong')].map((n) => n.textContent)
    expect(strong).toContain('正在 (zhèngzài)')
  })

  it('keeps the opening line as prose and splits several fenced sentences', () => {
    const { container } = render(
      <ChatMarkdown
        text={'Hi:\n\n```chinese\n你好。\nNǐ hǎo.\nHello.\n```\n\nSecond:\n\n```chinese\n谢谢。\nXièxie.\nThanks.\n```'}
      />,
    )

    expect(container.querySelector('.chat-md__p')?.textContent).toBe('Hi:')
    const heroes = [...container.querySelectorAll('.chat-hanzi__hanzi')].map((n) => n.textContent)
    expect(heroes).toEqual(['你好。', '谢谢。'])
  })

  it('falls back to prose for unformatted text and lone bullets', () => {
    const { container } = render(<ChatMarkdown text={'Just a line\nand another'} />)
    expect(container.querySelector('.chat-md__p')?.textContent).toBe('Just a lineand another')

    // Bullet without the gloss shape still renders as a list item.
    render(<ChatMarkdown text={'- plain item\n- second item'} />)
    expect(screen.getAllByText(/plain item|second item/).length).toBe(2)
  })

  it('renders an unclosed fence rather than losing the text', () => {
    const { container } = render(
      <ChatMarkdown text={'```chinese\n你好。\nNǐ hǎo.\nHello.'} />,
    )
    expect(container.querySelector('.chat-hanzi__hanzi')?.textContent).toBe('你好。')
  })
})