// frontend/src/FirstAidScreen.js
import React, { useState } from 'react';
import { firstAidTopics } from './firstAidData';
import './FirstAidScreen.css';

function FirstAidScreen() {
    const [expandedTopicId, setExpandedTopicId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const toggleTopic = (topicId) => {
        setExpandedTopicId(prevId => (prevId === topicId ? null : topicId));
    };

    const filteredTopics = firstAidTopics.filter(topic =>
        topic.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (topic.keywords && topic.keywords.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="first-aid-container">
            <h2>Первая Помощь</h2>
            <input
                type="text"
                placeholder="Поиск по темам..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="first-aid-search-input"
            />
            {filteredTopics.length > 0 ? (
                <ul className="first-aid-topic-list">
                    {filteredTopics.map(topic => (
                        <li key={topic.id} className="first-aid-topic-item">
                            <button
                                className="topic-title-button"
                                onClick={() => toggleTopic(topic.id)}
                                aria-expanded={expandedTopicId === topic.id}
                            >
                                {topic.title}
                                <span className="expand-icon">{expandedTopicId === topic.id ? '−' : '+'}</span>
                            </button>
                            {expandedTopicId === topic.id && (
                                <div className="topic-content">
                                    {topic.sections.map((section, index) => (
                                        <div key={index} className="topic-section">
                                            <h4>{section.title}</h4>
                                            <ul>
                                                {section.points.map((point, pIndex) => (
                                                    <li key={pIndex}>{point}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                <p>По вашему запросу ничего не найдено.</p>
            )}
        </div>
    );
}

export default FirstAidScreen;