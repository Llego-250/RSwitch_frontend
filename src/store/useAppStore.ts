import { create } from 'zustand'

export interface NotificationItem {
  id: string
  title: string
  message: string
  timestamp: string
  severity: 'critical' | 'warning' | 'info'
}

export interface AppState {
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  
  activeRole: string
  setActiveRole: (role: string) => void
  
  selectedInstitution: string
  setSelectedInstitution: (inst: string) => void
  
  searchQuery: string
  setSearchQuery: (query: string) => void
  
  notifications: NotificationItem[]
  addNotification: (notification: NotificationItem) => void
  dismissNotification: (id: string) => void
  clearNotifications: () => void
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  
  activeRole: 'Compliance Officer',
  setActiveRole: (role) => set({ activeRole: role }),
  
  selectedInstitution: 'All Financial Institutions',
  setSelectedInstitution: (inst) => set({ selectedInstitution: inst }),
  
  searchQuery: '',
  setSearchQuery: (query) => set({ searchQuery: query }),
  
  notifications: [
    {
      id: 'notif-1',
      title: 'High Latency Detected',
      message: 'SWIFT Ingestion pipeline latency exceeded threshold (120ms)',
      timestamp: '2 mins ago',
      severity: 'warning',
    },
    {
      id: 'notif-2',
      title: 'Schema Compliance Breach',
      message: '3 unmapped fields detected in Automated Clearing House stream',
      timestamp: '14 mins ago',
      severity: 'critical',
    },
  ],
  addNotification: (notification) =>
    set((state) => ({ notifications: [notification, ...state.notifications] })),
  dismissNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  clearNotifications: () => set({ notifications: [] }),
}))
