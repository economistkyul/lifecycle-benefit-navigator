import React from 'react'
import ReactDOM from 'react-dom/client'
import LifecycleBenefitNavigator from './LifecycleBenefitNavigator.jsx'
import liveBudgets from './live-budgets.json'
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LifecycleBenefitNavigator liveBudgets={liveBudgets} />
  </React.StrictMode>
)
