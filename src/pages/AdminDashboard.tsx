import { useState, useEffect } from 'react'
import { useLocation } from 'wouter'
import { db } from '../data/db'
import { CardSchema, DeckSchema, type Card, type Deck } from '../data/schema'

export function AdminDashboard() {
  const [, setLocation] = useLocation()
  const [decks, setDecks] = useState<Deck[]>([])
  const [cards, setCards] = useState<Card[]>([])
  const [selectedDeckId, setSelectedDeckId] = useState<string>('')
  
  // Card form state
  const [hanzi, setHanzi] = useState('')
  const [pinyin, setPinyin] = useState('')
  const [meaning, setMeaning] = useState('')
  const [tone, setTone] = useState<'1'|'2'|'3'|'4'|'5'>('1')
  const [tags, setTags] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)

  const fail = (text: string) => setNotice({ kind: 'error', text })
  const succeed = (text: string) => setNotice({ kind: 'ok', text })

  useEffect(() => {
    if (sessionStorage.getItem('admin') !== 'true') {
      setLocation('/')
      return
    }
    loadDecks()
  }, [])

  async function loadDecks() {
    const allDecks = await db.decks.toArray()
    setDecks(allDecks)
    if (allDecks.length > 0 && !selectedDeckId) {
      setSelectedDeckId(allDecks[0].id)
      loadCards(allDecks[0].id)
    } else if (selectedDeckId) {
      loadCards(selectedDeckId)
    }
  }

  async function loadCards(deckId: string) {
    const deckCards = await db.cards.where('deckId').equals(deckId).toArray()
    setCards(deckCards)
  }

  async function handleCreateDeck() {
    const name = window.prompt('Deck Name:')
    if (!name) return
    const id = `deck_${Date.now()}`
    const newDeck: Deck = {
      id,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: 1
    }
    await db.decks.add(newDeck)
    loadDecks()
    setSelectedDeckId(id)
    loadCards(id)
  }

  async function handleSaveCard(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedDeckId) {
      fail('Select a deck before saving a card.')
      return
    }

    const cardId = editingCardId || `card_${Date.now()}`
    
    // We should preserve createdAt if editing
    let existingCard: Card | undefined
    if (editingCardId) {
      existingCard = await db.cards.get(editingCardId)
    }

    const newCard: Card = {
      id: cardId,
      deckId: selectedDeckId,
      hanzi,
      pinyin,
      meaning,
      tone,
      audioUrl: audioUrl || undefined,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      createdAt: existingCard?.createdAt || Date.now(),
      updatedAt: Date.now(),
      schemaVersion: 1
    }

    try {
      CardSchema.parse(newCard)
      await db.cards.put(newCard) // put handles both add and update
      setHanzi('')
      setPinyin('')
      setMeaning('')
      setTags('')
      setAudioUrl('')
      setEditingCardId(null)
      succeed(editingCardId ? 'Card updated.' : 'Card added.')
      loadCards(selectedDeckId)
    } catch (err) {
      fail(err instanceof Error ? err.message : 'That card could not be saved.')
    }
  }

  function handleEditClick(c: Card) {
    setEditingCardId(c.id)
    setHanzi(c.hanzi)
    setPinyin(c.pinyin)
    setMeaning(c.meaning)
    setTone(c.tone)
    setTags((c.tags || []).join(', '))
    setAudioUrl(c.audioUrl || '')
  }

  async function handleDeleteCard(id: string) {
    await db.cards.delete(id)
    loadCards(selectedDeckId)
  }

  async function handleExport() {
    if (!selectedDeckId) return
    const deckToExport = decks.find(d => d.id === selectedDeckId)
    const cardsToExport = await db.cards.where('deckId').equals(selectedDeckId).toArray()
    
    const data = {
      deck: deckToExport,
      cards: cardsToExport
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${deckToExport?.name || 'export'}.json`
    a.click()
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    try {
      const data = JSON.parse(text)
      const deckParsed = DeckSchema.safeParse(data.deck)
      if (!deckParsed.success) {
        fail('That file is not a valid deck export.')
        return
      }

      const errors: string[] = []
      const validCards: Card[] = []
      
      for (const [index, card] of (data.cards || []).entries()) {
        const res = CardSchema.safeParse(card)
        if (res.success) {
          validCards.push(res.data)
        } else {
          errors.push(`Row ${index + 1}: ${res.error.message}`)
        }
      }

      if (errors.length > 0) {
        fail(
          `${errors.length} ${errors.length === 1 ? 'row' : 'rows'} failed validation. First: ${errors[0]}`,
        )
        return // Reject whole import on any error
      }

      await db.transaction('rw', db.decks, db.cards, async () => {
        await db.decks.put(deckParsed.data)
        for (const c of validCards) {
          await db.cards.put(c)
        }
      })
      
      succeed(`Imported ${validCards.length} cards into ${deckParsed.data.name}.`)
      loadDecks()
    } catch {
      fail('That file could not be read as JSON.')
    }
    e.target.value = ''
  }

  return (
    <div className="admin-shell">
      <div className="flex justify-between items-center mb-6">
        <div>
          <p className="eyebrow">hidden panel</p>
          <h2 className="display text-3xl">Admin</h2>
        </div>
        <button
          className="btn-quiet"
          onClick={() => {
            sessionStorage.removeItem('admin')
            setLocation('/')
          }}
        >
          Exit admin
        </button>
      </div>

      {notice && (
        <div
          className={`alert mb-6 ${notice.kind === 'error' ? 'alert--error' : 'alert--ok'}`}
          role={notice.kind === 'error' ? 'alert' : 'status'}
        >
          {notice.text}
        </div>
      )}

      <div className="admin-toolbar">
        <select
          className="flex-1"
          value={selectedDeckId}
          onChange={e => {
            setSelectedDeckId(e.target.value)
            loadCards(e.target.value)
          }}
        >
          <option value="">Select deck…</option>
          {decks.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button onClick={handleCreateDeck} className="primary">New deck</button>
      </div>

      {selectedDeckId && (
        <div className="admin-toolbar">
          <button
            className="secondary"
            onClick={async () => {
              const currentDeck = decks.find(d => d.id === selectedDeckId)
              const newName = window.prompt('Rename deck:', currentDeck?.name)
              if (newName && currentDeck) {
                await db.decks.update(selectedDeckId, { name: newName, updatedAt: Date.now() })
                loadDecks()
              }
            }}
          >
            Rename deck
          </button>
          <button
            className="btn-danger"
            onClick={async () => {
              if (window.confirm('Delete this deck and ALL its cards?')) {
                await db.decks.delete(selectedDeckId)
                const cardsToDelete = await db.cards.where('deckId').equals(selectedDeckId).toArray()
                for (const c of cardsToDelete) await db.cards.delete(c.id)
                setSelectedDeckId('')
                loadDecks()
              }
            }}
          >
            Delete deck
          </button>
        </div>
      )}

      <div className="admin-toolbar glass-panel p-4">
        <button className="secondary" disabled={!selectedDeckId} onClick={handleExport}>
          Export deck
        </button>
        <label className="btn-ghost file-label">
          Import JSON
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
            disabled={!selectedDeckId}
          />
        </label>
      </div>

      {selectedDeckId && (
        <form onSubmit={handleSaveCard} className="glass-panel admin-form">
          <h3 className="display text-2xl">{editingCardId ? 'Edit card' : 'Add card'}</h3>
          <label className="field">
            <span>Hanzi</span>
            <input placeholder="你好" required value={hanzi} onChange={e => setHanzi(e.target.value)} />
          </label>
          <label className="field">
            <span>Pinyin</span>
            <input placeholder="nǐ hǎo" required value={pinyin} onChange={e => setPinyin(e.target.value)} />
          </label>
          <label className="field">
            <span>Meaning</span>
            <input placeholder="hello" required value={meaning} onChange={e => setMeaning(e.target.value)} />
          </label>
          <label className="field">
            <span>Tone</span>
            <select value={tone} onChange={e => setTone(e.target.value as '1'|'2'|'3'|'4'|'5')}>
              <option value="1">Tone 1 — high level</option>
              <option value="2">Tone 2 — rising</option>
              <option value="3">Tone 3 — dip-rise</option>
              <option value="4">Tone 4 — falling</option>
              <option value="5">Tone 5 (neutral)</option>
            </select>
          </label>
          <label className="field">
            <span>Tags</span>
            <input placeholder="greeting, hsk1" value={tags} onChange={e => setTags(e.target.value)} />
          </label>
          <label className="field">
            <span>Audio URL</span>
            <input placeholder="/assets/deck/audio/ni3.mp3" value={audioUrl} onChange={e => setAudioUrl(e.target.value)} />
          </label>
          <div className="flex gap-2 mt-2">
            <button type="submit" className="primary flex-1">
              {editingCardId ? 'Update card' : 'Add card'}
            </button>
            {editingCardId && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditingCardId(null)
                  setHanzi('')
                  setPinyin('')
                  setMeaning('')
                  setTags('')
                  setAudioUrl('')
                  setNotice(null)
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}

      <div>
        <h3 className="display text-2xl mb-4">Cards ({cards.length})</h3>
        <div className="glass-panel overflow-hidden">
          {cards.length === 0 && (
            <p className="p-4 faint text-sm">No cards in this deck yet.</p>
          )}
          {cards.map(c => (
            <div key={c.id} className="card-row">
              <div className="card-row__main">
                <span className="font-bold text-lg hanzi-text">{c.hanzi}</span>
                <span className="text-gray-400">{c.pinyin}</span>
                <span className="text-gray-500 text-sm">{c.meaning}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleEditClick(c)} className="btn-quiet">Edit</button>
                <button onClick={() => handleDeleteCard(c.id)} className="btn-quiet">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
