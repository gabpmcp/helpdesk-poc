export const fetchDashboardData = (client) => (contactId) =>
    client.get(`/reports/contact/${contactId}`)
      .then(data => ({ metrics: data }))
      .catch(err => Promise.reject({ type: 'DASHBOARD_ERROR', details: err }))