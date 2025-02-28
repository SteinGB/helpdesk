"use client"

import { useState, useEffect, useRef } from "react"
import { format } from "date-fns"
import { Trash2, Send, X, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const fetchTicketsFromAPI = async (setMessages, setNotifications, lastNotificationTimeRef) => {
  try {
    const response = await fetch("/api/create-ticket")
    const notificationsResponse = await fetch("/api/notifications")

    if (!response.ok) {
      throw new Error(`❌ API request failed with status: ${response.status}`)
    }

    const contentType = response.headers.get("content-type")
    if (!contentType || !contentType.includes("application/json")) {
      throw new Error("❌ Invalid response format: Expected JSON but got something else")
    }

    const data = await response.json()
    const data_notif = await notificationsResponse.json()
    console.log("Tickets retornados:", data)
    console.log("Notificações retornadas:", data_notif)

    if (data.success && Array.isArray(data.tickets)) {
      setMessages(data.tickets)
    } else {
      console.warn("❌ API returned no tickets")
    }

    // Supondo que a resposta de notificações também tenha a propriedade "tickets"
    if (data_notif.success && Array.isArray(data_notif.tickets)) {
      const allNotifs = data_notif.tickets

      // Filtra apenas as notificações com created_at posterior à referência
      const newNotifs = allNotifs.filter(notif => {
        return new Date(notif.created_at) > lastNotificationTimeRef.current
      })

      if (newNotifs.length > 0) {
        // Se desejar, acumule as novas notificações no estado (ou substitua, conforme sua necessidade)
        setNotifications(prev => [...prev, ...newNotifs])
        // Atualiza o último timestamp para a notificação mais recente recebida
        const maxDate = newNotifs.reduce((max, notif) => {
          const notifDate = new Date(notif.created_at)
          return notifDate > max ? notifDate : max
        }, lastNotificationTimeRef.current)
        lastNotificationTimeRef.current = maxDate
      } else {
        console.warn("Nenhuma notificação nova")
      }
    } else {
      console.warn("❌ Nenhuma notificação retornada")
    }
  } catch (error) {
    console.error("❌ Failed to fetch data:", error)
  }
}

export default function InboxPage() {
  const [messages, setMessages] = useState([])
  const [notifications, setNotifications] = useState([])
  // Armazena o timestamp inicial (apenas notificações posteriores a esse momento serão consideradas novas)
  const lastNotificationTimeRef = useRef(new Date())

  const [selectedMessage, setSelectedMessage] = useState(null)
  const [replyText, setReplyText] = useState("")
  const [status, setStatus] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const messagesPerPage = 10

  useEffect(() => {
    // Na primeira chamada, notificações anteriores ao mount serão ignoradas
    fetchTicketsFromAPI(setMessages, setNotifications, lastNotificationTimeRef)
    const interval = setInterval(() => fetchTicketsFromAPI(setMessages, setNotifications, lastNotificationTimeRef), 5000)
    return () => clearInterval(interval)
  }, [])

  const openTicket = async (message) => {
    try {
      await fetch("https://api.helpdesk.meerkatcoding.com/webhook/get-email-thread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: message.id
        }),
      })
    } catch (error) {
      console.error("❌ Client not found", error)
    }
    setSelectedMessage(message)
  }

  const closeTicket = (e) => {
    if (e.target.id === "ticketModal") {
      setSelectedMessage(null)
    }
  }

  const updateTicketStatus = async (id, newStatus) => {
    if (!id) {
      console.error("❌ Missing ticket ID.")
      return
    }

    try {
      const response = await fetch("/api/update-ticket", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: newStatus }),
      })

      const result = await response.json()
      if (result.success) {
        setMessages(messages.map((msg) => (msg.id === id ? { ...msg, status: newStatus } : msg)))
        setSelectedMessage({ ...selectedMessage, status: newStatus })
        setStatus(newStatus)
      } else {
        console.error("❌ Failed to update ticket status:", result.error)
      }
    } catch (error) {
      console.error("❌ Error updating ticket status:", error)
    }
  }

  const handleSendReply = async () => {
    if (!replyText.trim()) return

    const newReply = {
      sender: "Support Team",
      message: replyText,
      timestamp: new Date().toISOString(),
    }

    const updatedConversation = [...selectedMessage.conversation, newReply]

    try {
      const response = await fetch("/api/update-ticket", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedMessage.id,
          conversation: updatedConversation,
        }),
      })

      const result = await response.json()
      if (result.success) {
        setMessages(
          messages.map((msg) =>
            msg.id === selectedMessage.id
              ? { ...msg, conversation: updatedConversation }
              : msg
          )
        )
        setSelectedMessage({ ...selectedMessage, conversation: updatedConversation })
      } else {
        console.error("❌ Failed to update ticket:", result.error)
      }
    } catch (error) {
      console.error("❌ Error updating ticket:", error)
    }

    try {
      await fetch("https://api.helpdesk.meerkatcoding.com/webhook/send-email-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedMessage.id,
          message: newReply,
        }),
      })
    } catch (error) {
      console.error("❌ Error sending the email:", error)
    }

    setReplyText("")
  }

  const deleteTicket = async (id) => {
    try {
      const response = await fetch("/api/delete-ticket", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })

      const result = await response.json()
      if (result.success) {
        setMessages(messages.filter((msg) => msg.id !== id))
        setSelectedMessage(null)
      } else {
        console.error("❌ Failed to delete ticket:", result.error)
      }
    } catch (error) {
      console.error("❌ Error deleting ticket:", error)
    }
  }

  const getStatusTag = (status) => {
    let color = "bg-gray-400"
    if (status === "open") color = "bg-green-500"
    if (status === "attending") color = "bg-yellow-500"
    if (status === "closed") color = "bg-red-500"

    return <span className={`px-2 py-1 text-white text-xs font-bold rounded ${color}`}>{status.toUpperCase()}</span>
  }

  const filteredMessages = messages.filter(
    (message) =>
      (statusFilter === "all" || message.status === statusFilter) &&
      (message.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        message.from_email.toLowerCase().includes(searchQuery.toLowerCase())),
  )

  const indexOfLastMessage = currentPage * messagesPerPage
  const indexOfFirstMessage = indexOfLastMessage - messagesPerPage
  const currentMessages = filteredMessages.slice(indexOfFirstMessage, indexOfLastMessage)

  const totalPages = Math.ceil(filteredMessages.length / messagesPerPage)

  const paginate = (pageNumber) => setCurrentPage(pageNumber)

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Inbox</h1>

      {/* Seção de Notificações - exibindo apenas as novas */}
      {notifications.length > 0 && (
        <div className="mb-6">
          <h2 className="text-2xl font-semibold mb-4">Novas Notificações</h2>
          {notifications.map((notif) => (
            <div key={notif.id} className="bg-blue-50 border border-blue-200 p-4 rounded mb-2">
              <p>{notif.message || "Nova notificação"}</p>
              <p className="text-sm text-gray-500">
                {notif.created_at ? format(new Date(notif.created_at), "MMM d, yyyy h:mm a") : ""}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-center space-x-4">
        <Input
          type="text"
          placeholder="Search messages..."
          className="flex-grow"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tickets</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="attending">Attending</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2 mb-4">
        {currentMessages.map((message) => (
          <div
            key={message.id}
            className="flex items-center justify-between p-3 rounded cursor-pointer bg-white hover:bg-gray-100"
          >
            <div className="flex-grow" onClick={() => openTicket(message)}>
              <div className="flex justify-between">
                <span className="font-semibold text-black">{message.from_email || "Unknown Sender"}</span>
                <span className="text-sm text-gray-500">
                  {message.created_at ? format(new Date(message.created_at), "MMM d, yyyy h:mm a") : "Unknown Time"}
                </span>
              </div>
              <div className="text-sm text-gray-600 truncate">{message.subject}</div>
            </div>
            <div className="ml-4 flex items-center space-x-3">
              {getStatusTag(message.status)}
              <Button variant="ghost" onClick={() => deleteTicket(message.id)}>
                <Trash2 className="h-5 w-5 text-red-500" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Paginação */}
      <div className="flex justify-center items-center space-x-2 mt-4">
        <Button variant="outline" onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>
          {currentPage} of {totalPages}
        </span>
        <Button variant="outline" onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {selectedMessage && (
        <div
          id="ticketModal"
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
          onClick={closeTicket}
        >
          <div
            className="bg-white rounded-lg w-full max-w-3xl h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">{selectedMessage.subject}</h3>
                <Button variant="ghost" onClick={() => setSelectedMessage(null)}>
                  <X className="h-6 w-6 text-gray-600" />
                </Button>
              </div>
              <div className="mt-4 bg-gray-50 p-4 rounded-lg">
                <p>
                  <strong>From:</strong> {selectedMessage.from_email || "Unknown Sender"}
                </p>
                <p>
                  <strong>Date:</strong>{" "}
                  {selectedMessage.created_at
                    ? format(new Date(selectedMessage.created_at), "MMM d, yyyy h:mm a")
                    : "Unknown Time"}
                </p>
              </div>
              <div className="mt-4">
                <label className="block font-bold mb-1">Status:</label>
                <Select value={status} onValueChange={(value) => updateTicketStatus(selectedMessage.id, value)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">🟢 Open</SelectItem>
                    <SelectItem value="attending">🟡 Attending</SelectItem>
                    <SelectItem value="closed">🔴 Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {selectedMessage.conversation?.length > 0 && (
                <div>
                  <h4 className="font-bold mb-2">Conversation History:</h4>
                  {selectedMessage.conversation.map((reply, index) => (
                    <div key={index} className="mb-4 bg-gray-50 p-3 rounded-lg">
                      <p>
                        <strong>{reply.sender}:</strong> {reply.message}
                      </p>
                      <p className="text-sm text-gray-500">
                        {reply.timestamp ? format(new Date(reply.timestamp), "MMM d, yyyy h:mm a") : "Unknown Time"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t">
              <Textarea
                placeholder="Type your reply here..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={3}
                className="mb-2"
              />
              <div className="flex justify-end">
                <Button onClick={handleSendReply}>
                  <Send className="mr-2 h-4 w-4" /> Send Reply
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
