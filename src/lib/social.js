function directKeyForUsers(userA, userB) {
  return [userA, userB].sort().join(':')
}

function profileDisplayName(profile) {
  return profile?.name || profile?.email?.split('@')[0] || 'Member'
}

export async function fetchSocialData(client, userId) {
  if (!client || !userId) {
    return {
      requests: [],
      friends: [],
      threads: [],
    }
  }

  const [{ data: requestRows }, { data: participantRows }] = await Promise.all([
    client
      .from('friend_requests')
      .select(`
        *,
        sender:profiles!friend_requests_sender_id_fkey (
          id,
          name,
          email,
          city
        ),
        receiver:profiles!friend_requests_receiver_id_fkey (
          id,
          name,
          email,
          city
        )
      `)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false }),
    client
      .from('chat_participants')
      .select(`
        thread_id,
        user_id,
        last_read_at,
        thread:chat_threads (
          id,
          type,
          title,
          event_id,
          direct_key,
          created_at,
          event:events (
            id,
            title,
            city,
            date
          )
        ),
        user:profiles (
          id,
          name,
          email,
          city
        )
      `)
      .order('created_at', { ascending: true }),
  ])

  const requests = requestRows || []
  const friends = requests
    .filter((request) => request.status === 'accepted')
    .map((request) => (request.sender_id === userId ? request.receiver : request.sender))

  const myParticipantRows = (participantRows || []).filter((row) => row.user_id === userId)
  const threadIds = myParticipantRows.map((row) => row.thread_id)

  const [{ data: threadParticipants }, { data: messages }] = await Promise.all([
    threadIds.length === 0
      ? Promise.resolve({ data: [] })
      : client
        .from('chat_participants')
        .select(`
          thread_id,
          user_id,
          user:profiles (
            id,
            name,
            email,
            city
          )
        `)
        .in('thread_id', threadIds),
    threadIds.length === 0
      ? Promise.resolve({ data: [] })
      : client
        .from('messages')
        .select('*')
        .in('thread_id', threadIds)
        .order('created_at', { ascending: true }),
  ])

  const participantsByThread = {}
  ;(threadParticipants || []).forEach((row) => {
    participantsByThread[row.thread_id] = [...(participantsByThread[row.thread_id] || []), row.user]
  })

  const messagesByThread = {}
  ;(messages || []).forEach((message) => {
    messagesByThread[message.thread_id] = [...(messagesByThread[message.thread_id] || []), message]
  })

  const threads = myParticipantRows.map((row) => {
    const thread = row.thread
    const participants = participantsByThread[row.thread_id] || []
    const directPartner = thread.type === 'direct'
      ? participants.find((participant) => participant?.id !== userId)
      : null

    return {
      ...thread,
      participants,
      partner: directPartner,
      titleDisplay: thread.type === 'event'
        ? `${thread.event?.title || thread.title || 'Event chat'}`
        : profileDisplayName(directPartner),
      subtitleDisplay: thread.type === 'event'
        ? `${thread.event?.city || 'Event chat'}`
        : 'Direct chat',
      messages: messagesByThread[row.thread_id] || [],
    }
  }).sort((a, b) => {
    const aTime = a.messages.at(-1)?.created_at || a.created_at
    const bTime = b.messages.at(-1)?.created_at || b.created_at
    return new Date(bTime).getTime() - new Date(aTime).getTime()
  })

  return { requests, friends, threads }
}

export async function ensureDirectThread(client, userId, otherUserId) {
  const directKey = directKeyForUsers(userId, otherUserId)

  let { data: existing } = await client
    .from('chat_threads')
    .select('*')
    .eq('direct_key', directKey)
    .maybeSingle()

  if (!existing) {
    const { data: created, error: createError } = await client
      .from('chat_threads')
      .insert({
        type: 'direct',
        created_by: userId,
        direct_key: directKey,
      })
      .select('*')
      .single()

    if (createError) throw createError
    existing = created
  }

  const participantRows = [
    { thread_id: existing.id, user_id: userId },
    { thread_id: existing.id, user_id: otherUserId },
  ]

  await client.from('chat_participants').upsert(participantRows, { onConflict: 'thread_id,user_id' })
  return existing
}

export async function ensureEventThread(client, event, userId) {
  if (!client || !event?.id || !userId) return null

  let { data: existing } = await client
    .from('chat_threads')
    .select('*')
    .eq('event_id', event.id)
    .maybeSingle()

  if (!existing) {
    const { data: created, error: createError } = await client
      .from('chat_threads')
      .insert({
        type: 'event',
        created_by: userId,
        event_id: event.id,
        title: event.title,
      })
      .select('*')
      .single()

    if (createError) throw createError
    existing = created
  }

  const participantRows = [...new Set([event.host_id, ...(event.attendees || [])])]
    .filter(Boolean)
    .map((participantId) => ({
      thread_id: existing.id,
      user_id: participantId,
    }))

  if (participantRows.length > 0) {
    await client.from('chat_participants').upsert(participantRows, { onConflict: 'thread_id,user_id' })
  }

  return existing
}

export async function sendFriendRequest(client, senderId, receiverId) {
  const { data: existing } = await client
    .from('friend_requests')
    .select('*')
    .or(`and(sender_id.eq.${senderId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${senderId})`)
    .maybeSingle()

  if (existing?.status === 'accepted') return { alreadyFriends: true }
  if (existing?.status === 'pending') return { alreadyPending: true }
  if (existing?.status === 'declined') {
    const { error: retryError } = await client
      .from('friend_requests')
      .update({
        sender_id: senderId,
        receiver_id: receiverId,
        status: 'pending',
        responded_at: null,
      })
      .eq('id', existing.id)

    if (retryError) throw retryError
    return { sent: true }
  }

  const { error } = await client.from('friend_requests').insert({
    sender_id: senderId,
    receiver_id: receiverId,
    status: 'pending',
  })

  if (error) throw error
  return { sent: true }
}

export async function respondToFriendRequest(client, requestId, status) {
  const { error } = await client
    .from('friend_requests')
    .update({
      status,
      responded_at: new Date().toISOString(),
    })
    .eq('id', requestId)

  if (error) throw error
}

export async function sendMessage(client, threadId, senderId, body) {
  const trimmed = body.trim()
  if (!trimmed) return null

  const { data, error } = await client
    .from('messages')
    .insert({
      thread_id: threadId,
      sender_id: senderId,
      body: trimmed,
    })
    .select('*')
    .single()

  if (error) throw error
  return data
}
