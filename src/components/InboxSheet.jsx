import { useEffect, useMemo, useState } from 'react'

function formatTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function profileName(profile) {
  return profile?.name || profile?.email?.split('@')[0] || 'Member'
}

export default function InboxSheet({
  session,
  requests,
  friends,
  threads,
  activeThreadId,
  onClose,
  onOpenThread,
  onOpenDirectChat,
  onSendMessage,
  onRespondToRequest,
}) {
  const [tab, setTab] = useState('chats')
  const [draft, setDraft] = useState('')
  const currentThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) || threads[0] || null,
    [activeThreadId, threads],
  )

  const pendingRequests = requests.filter((request) => request.status === 'pending')
  const myId = session?.user?.id

  const submit = async () => {
    if (!currentThread || !draft.trim()) return
    await onSendMessage(currentThread.id, draft)
    setDraft('')
  }

  useEffect(() => {
    if (activeThreadId) {
      setTab('chats')
    }
  }, [activeThreadId])

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div className="sheet-modal inbox-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <div>
            <div className="sheet-title">Inbox</div>
            <div className="sheet-subtitle">Event chats, direct messages, and friend requests all in one place.</div>
          </div>
          <button type="button" className="icon-dismiss" onClick={onClose}>x</button>
        </div>

        <div className="dashboard-tabs">
          <button type="button" className={`filter-pill ${tab === 'chats' ? 'active' : ''}`} onClick={() => setTab('chats')}>
            Chats
          </button>
          <button type="button" className={`filter-pill ${tab === 'friends' ? 'active' : ''}`} onClick={() => setTab('friends')}>
            Friends
          </button>
        </div>

        {tab === 'friends' ? (
          <div className="inbox-stack">
            <section className="dashboard-section">
              <div className="profile-section-title">Pending requests</div>
              <div className="profile-list">
                {pendingRequests.length === 0 ? <div className="helper-copy">No pending friend requests.</div> : pendingRequests.map((request) => {
                  const isIncoming = request.receiver_id === myId
                  const otherUser = isIncoming ? request.sender : request.receiver
                  return (
                    <div key={request.id} className="profile-item dashboard-item">
                      <strong>{profileName(otherUser)}</strong>
                      <span>{isIncoming ? 'Sent you a request' : 'Request sent'}</span>
                      <div className="profile-item-actions">
                        {isIncoming ? (
                          <>
                            <button type="button" className="inline-link-button" onClick={() => onRespondToRequest(request.id, 'accepted')}>
                              Accept
                            </button>
                            <button type="button" className="inline-link-button danger-link-button" onClick={() => onRespondToRequest(request.id, 'declined')}>
                              Decline
                            </button>
                          </>
                        ) : (
                          <span className="helper-copy">Waiting for response</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="dashboard-section">
              <div className="profile-section-title">Friends</div>
              <div className="profile-list">
                {friends.length === 0 ? <div className="helper-copy">No friends added yet.</div> : friends.map((friend) => (
                  <div key={friend.id} className="profile-item dashboard-item">
                    <strong>{profileName(friend)}</strong>
                    <span>{friend.city || 'No city added yet'}</span>
                    <div className="profile-item-actions">
                      <button type="button" className="inline-link-button" onClick={() => onOpenDirectChat(friend)}>
                        Message
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="chat-layout">
            <div className="chat-thread-list">
              <div className="profile-section-title">Chats</div>
              <div className="profile-list">
                {threads.length === 0 ? <div className="helper-copy">No chats yet. Join an event or message a friend.</div> : threads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    className={`chat-thread-card ${currentThread?.id === thread.id ? 'active' : ''}`}
                    onClick={() => onOpenThread(thread.id)}
                  >
                    <strong>{thread.titleDisplay}</strong>
                    <span>{thread.messages.at(-1)?.body || thread.subtitleDisplay}</span>
                    <small>{formatTime(thread.messages.at(-1)?.created_at || thread.created_at)}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="chat-conversation">
              {currentThread ? (
                <>
                  <div className="chat-conversation-head">
                    <strong>{currentThread.titleDisplay}</strong>
                    <span>{currentThread.subtitleDisplay}</span>
                  </div>
                  <div className="chat-messages">
                    {currentThread.messages.length === 0 ? <div className="helper-copy">No messages yet. Start the conversation.</div> : currentThread.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`chat-bubble ${message.sender_id === myId ? 'mine' : ''}`}
                      >
                        <div>{message.body}</div>
                        <small>{formatTime(message.created_at)}</small>
                      </div>
                    ))}
                  </div>
                  <div className="chat-compose">
                    <textarea
                      className="sheet-textarea chat-textarea"
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder="Write a message"
                    />
                    <button type="button" className="primary-submit" onClick={submit}>
                      Send
                    </button>
                  </div>
                </>
              ) : (
                <div className="helper-copy">Pick a chat to start messaging.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
