import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { memo, useState } from 'react'

function CopyBtn({ text }) {
    const [copied, setCopied] = useState(false)
    const copy = () => {
        navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
    }
    return (
        <button className="continue-btn" onClick={copy} title="复制全部回答内容">
            {copied ? '✓ 已复制' : '📋 复制全部'}
        </button>
    )
}

const MessageItem = memo(function MessageItem({ message, isStreaming, streamingText, onRetry, onEdit }) {
    const isUser = message.role === 'user'
    const isAssistant = message.role === 'assistant'

    // Render content (may be string or array for multimodal)
    const renderContent = (content, streaming = false) => {
        if (typeof content === 'string') {
            if (isAssistant) {
                return (
                    <div className="message-bubble">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{streaming ? content : content}</ReactMarkdown>
                        {streaming && <span className="streaming-cursor" />}
                    </div>
                )
            }
            return <div className="message-bubble">{content}{streaming && <span className="streaming-cursor" />}</div>
        }

        // Multimodal array
        if (Array.isArray(content)) {
            const images = content.filter(p => p.type === 'image_url')
            const docs = content.filter(p => p.type === 'document' || (p.type === 'text' && p.text?.startsWith('[附件:')))
            const texts = content.filter(p => p.type === 'text' && !p.text?.startsWith('[附件:'))

            return (
                <div>
                    {images.map((img, i) => (
                        <img key={i} className="message-image" src={img.image_url?.url || img.data_url} alt="上传图片" />
                    ))}
                    {docs.map((doc, i) => (
                        <div key={i} className="doc-chip">📄 {doc.filename || '文档'}</div>
                    ))}
                    {texts.length > 0 && (
                        <div className={`message-bubble${isAssistant ? '' : ''}`}>
                            {isAssistant
                                ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{texts.map(t => t.text).join('\n')}</ReactMarkdown>
                                : texts.map(t => t.text).join('\n')
                            }
                        </div>
                    )}
                </div>
            )
        }

        return <div className="message-bubble">{String(content)}</div>
    }

    const displayContent = isStreaming ? streamingText : message.content
    const usage = message.usage

    return (
        <div className={`message-item ${message.role}`}>
            <div className="message-avatar">
                {isUser ? '👤' : '✦'}
            </div>
            <div className="message-body">
                {renderContent(displayContent, isStreaming)}
                <div className="message-meta">
                    {!isStreaming && isUser && onEdit && (
                        <button className="continue-btn" onClick={onEdit} title="编辑此消息并重新发送">
                            ✏️ 编辑
                        </button>
                    )}
                    {!isStreaming && isAssistant && (
                        <CopyBtn text={typeof message.content === 'string' ? message.content : ''} />
                    )}
                    {message.model && (
                        <span style={{ opacity: 0.7 }}>{message.model}</span>
                    )}
                    {usage && (
                        <span className="usage-chip">
                            ↑{usage.prompt_tokens ?? '?'} ↓{usage.completion_tokens ?? '?'} tokens
                        </span>
                    )}
                    {!isStreaming && isAssistant && onRetry && (
                        <button className="continue-btn" onClick={onRetry} title="撤销此回复并重新生成">
                            🔄 重试
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
})

export default MessageItem;
