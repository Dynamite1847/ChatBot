import { useEffect } from 'react'
import useStore from './stores/store'
import { fetchConfig } from './utils/api'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import ParamDrawer from './components/ParamDrawer'
import SettingsModal from './components/SettingsModal'

function ToastContainer() {
    const { toasts } = useStore()
    return (
        <div className="toast-container">
            {toasts.map(t => (
                <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
            ))}
        </div>
    )
}

export default function App() {
    const { config, setConfig, showSettings, params, setParams } = useStore()

    useEffect(() => {
        fetchConfig().then(cfg => {
            setConfig(cfg)
            const dp = cfg.default_params || {}
            setParams({
                provider: cfg.default_provider,
                model: cfg.default_model,
                max_tokens: dp.max_tokens ?? 8096,
                temperature: dp.temperature ?? 1.0,
                top_p: dp.top_p ?? 1.0,
                frequency_penalty: dp.frequency_penalty ?? 0.0,
                context_strategy: cfg.context_strategy ?? 'rounds',
                context_rounds: cfg.context_rounds ?? 10,
                context_token_threshold: cfg.context_token_threshold ?? 8000,
            })
        }).catch(() => { })
    }, [])

    return (
        <div className="app-layout">
            <Sidebar />
            <ChatPanel />
            <ParamDrawer />
            {showSettings && <SettingsModal />}
            <ToastContainer />
        </div>
    )
}
