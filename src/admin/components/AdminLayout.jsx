import React from 'react'

export default function AdminLayout({ sidebar, topbar, children }) {
  return (
    <div className="admin-shell">
      {sidebar}
      <div className="admin-main-column">
        {topbar}
        <main className="admin-content">{children}</main>
      </div>
    </div>
  )
}
