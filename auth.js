export const authenticateUser = (client) => (email, password) =>
    client.get(`/contacts/search?email=${email}`)
      .then(user => 
        user && password === 'demo' // Replace with real hash check or SSO integration
          ? ({ user, role: user.role || 'Standard' })
          : Promise.reject({ type: 'AUTH_FAILED' })
      )
      
  export const isAuthorized = (role) => (requiredRole) =>
    role === requiredRole
      ? Promise.resolve(true)
      : Promise.reject({ type: 'ACCESS_DENIED' })