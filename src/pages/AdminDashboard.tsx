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
    if (!selectedDeckId) return alert('Select a deck first')

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
      loadCards(selectedDeckId)
    } catch (err) {
      alert('Invalid card data: ' + JSON.stringify(err))
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
        alert('Invalid deck format')
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
        alert(`Import errors:\n\n${errors.join('\n')}`)
        return // Reject whole import on any error
      }

      await db.transaction('rw', db.decks, db.cards, async () => {
        await db.decks.put(deckParsed.data)
        for (const c of validCards) {
          await db.cards.put(c)
        }
      })
      
      alert('Import successful!')
      loadDecks()
    } catch (err) {
      alert('Failed to parse JSON file.')
    }
    e.target.value = ''
  }

  return (
    <div className="card-container w-full max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Admin Dashboard</h2>
        <button onClick={() => {
          sessionStorage.removeItem('admin')
          setLocation('/')
        }} className="text-gray-400">Exit Admin</button>
      </div>

      <div className="flex gap-4 mb-6">
        <select 
          className="bg-gray-800 p-2 rounded text-white flex-1"
          value={selectedDeckId} 
          onChange={e => {
            setSelectedDeckId(e.target.value)
            loadCards(e.target.value)
          }}
        >
          <option value="">Select Deck...</option>
          {decks.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button onClick={handleCreateDeck} className="bg-blue-600 px-4 py-2 rounded">New Deck</button>
      </div>

      {selectedDeckId && (
        <div className="flex gap-4 mb-6">
          <button onClick={async () => {
            const currentDeck = decks.find(d => d.id === selectedDeckId)
            const newName = window.prompt('Rename deck:', currentDeck?.name)
            if (newName && currentDeck) {
              await db.decks.update(selectedDeckId, { name: newName, updatedAt: Date.now() })
              loadDecks()
            }
          }} className="bg-gray-700 px-4 py-2 rounded">Rename Deck</button>
          <button onClick={async () => {
            if (window.confirm('Delete this deck and ALL its cards?')) {
              await db.decks.delete(selectedDeckId)
              const cardsToDelete = await db.cards.where('deckId').equals(selectedDeckId).toArray()
              for (const c of cardsToDelete) await db.cards.delete(c.id)
              setSelectedDeckId('')
              loadDecks()
            }
          }} className="bg-red-900 text-red-100 px-4 py-2 rounded">Delete Deck</button>
        </div>
      )}

      <div className="flex gap-4 mb-6 glass-panel p-4">
        <button onClick={handleExport} className="bg-gray-700 px-4 py-2 rounded">Export Deck</button>
        <label className="bg-gray-700 px-4 py-2 rounded cursor-pointer">
          Import JSON
          <input type="file" accept=".json" className="hidden" onChange={handleImport} />
        </label>
      </div>

      {selectedDeckId && (
        <form onSubmit={handleSaveCard} className="glass-panel p-4 mb-6 flex flex-col gap-3">
          <h3 className="font-bold">{editingCardId ? 'Edit Card' : 'Add Card'}</h3>
          <input placeholder="Hanzi (e.g. 你好)" required value={hanzi} onChange={e => setHanzi(e.target.value)} className="bg-gray-800 p-2 rounded text-white" />
          <input placeholder="Pinyin (e.g. nǐ hǎo)" required value={pinyin} onChange={e => setPinyin(e.target.value)} className="bg-gray-800 p-2 rounded text-white" />
          <input placeholder="Meaning" required value={meaning} onChange={e => setMeaning(e.target.value)} className="bg-gray-800 p-2 rounded text-white" />
          <select value={tone} onChange={e => setTone(e.target.value as any)} className="bg-gray-800 p-2 rounded text-white">
            <option value="1">Tone 1</option>
            <option value="2">Tone 2</option>
            <option value="3">Tone 3</option>
            <option value="4">Tone 4</option>
            <option value="5">Tone 5 (Neutral)</option>
          </select>
          <input placeholder="Tags (comma separated)" value={tags} onChange={e => setTags(e.target.value)} className="bg-gray-800 p-2 rounded text-white" />
          <input placeholder="Audio URL (optional)" value={audioUrl} onChange={e => setAudioUrl(e.target.value)} className="bg-gray-800 p-2 rounded text-white" />
          <div className="flex gap-2 mt-2">
            <button type="submit" className="primary py-2 flex-1">{editingCardId ? 'Update Card' : 'Add Card'}</button>
            {editingCardId && (
              <button type="button" onClick={() => {
                setEditingCardId(null)
                setHanzi('')
                setPinyin('')
                setMeaning('')
                setTags('')
                setAudioUrl('')
              }} className="bg-gray-600 py-2 px-4 rounded">Cancel</button>
            )}
          </div>
        </form>
      )}

      <div>
        <h3 className="font-bold mb-4">Cards ({cards.length})</h3>
        <div className="flex flex-col gap-2">
          {cards.map(c => (
            <div key={c.id} className="glass-panel p-3 flex justify-between items-center">
              <div>
                <span className="font-bold text-lg mr-2">{c.hanzi}</span>
                <span className="text-gray-400 mr-2">{c.pinyin}</span>
                <span className="text-gray-500 text-sm">{c.meaning}</span>
              </div>
              <div>
                <button onClick={() => handleEditClick(c)} className="text-blue-400 hover:text-blue-300 mr-4">Edit</button>
                <button onClick={() => handleDeleteCard(c.id)} className="text-red-400 hover:text-red-300">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
