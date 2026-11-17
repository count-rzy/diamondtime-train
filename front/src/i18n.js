import { useSyncExternalStore } from 'react'
import baseEn from './locales/en.json'
import baseRu from './locales/ru.json'
import { extra } from './locales/extra'

export const dictionaries = { en: { ...baseEn }, ru: { ...baseRu } }
for (const [key, values] of Object.entries(extra)) {
  dictionaries.en[key] = values[0]
  dictionaries.ru[key] = values[1]
}
let language = 'ru'
try {
  if (localStorage.getItem('lasttrain:language') === 'en') language = 'en'
} catch {
  /* storage may be disabled */
}
const listeners = new Set()
export const getLanguage = () => language
const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage, getLanguage)
export function setLanguage(value) {
  if (!['ru', 'en'].includes(value)) return
  language = value
  try {
    localStorage.setItem('lasttrain:language', value)
  } catch {
    /* SQLite remains authoritative */
  }
  document.documentElement.lang = value
  document.title =
    value === 'ru' ? 'Last Train — время в пути' : 'Last Train — make the journey count'
  listeners.forEach((listener) => listener())
}
export function t(key, values = {}) {
  const template = dictionaries[language][key] ?? dictionaries.en[key] ?? key
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? `{${name}}`))
}
export function plural(key, count) {
  const form = new Intl.PluralRules(language).select(count)
  return t(`${key}_${form}`, { count: new Intl.NumberFormat(language).format(count) })
}
export const formatDate = (value, withTime = false) =>
  new Intl.DateTimeFormat(
    language === 'ru' ? 'ru-RU' : 'en-US',
    withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' },
  ).format(new Date(value))
export const formatDuration = (minutes) =>
  t('duration.short', {
    hours: Math.floor(Math.round(minutes) / 60),
    minutes: Math.round(minutes) % 60,
  })
export const formatNumber = (value) => new Intl.NumberFormat(language).format(value)
const reverse = new Map(Object.entries(dictionaries.en).map(([key, value]) => [value, key]))
for (const [key, value] of Object.entries(dictionaries.ru)) reverse.set(value, key)
export function translateMessage(message) {
  if (reverse.has(message)) return t(reverse.get(message))
  if (message === 'This field cannot be blank.') return t('error.blank')
  if (/CSRF/.test(message)) return t('error.csrf')
  if (/Failed to fetch|NetworkError|Load failed/.test(message)) return t('error.network')
  if (/is not a valid choice|Invalid pk|Invalid data|Expected a dictionary/.test(message))
    return t('error.generic')
  for (const [pattern, key] of [
    [/greater than or equal to (\d+)/, 'error.min'],
    [/less than or equal to (\d+)/, 'error.max'],
    [/no more than (\d+) characters/, 'error.length'],
  ]) {
    const match = String(message).match(pattern)
    if (match) return t(key, { limit: match[1] })
  }
  return message
}
export function apiError(data) {
  const message = (value) => {
    const text = String(value)
    const translated = translateMessage(text)
    return language === 'ru' && translated === text && /[a-z]/i.test(text)
      ? t('error.generic')
      : translated
  }
  if (Array.isArray(data)) return data.map(message).join(' · ')
  if (data.detail) return message(data.detail)
  return (
    Object.entries(data)
      .map(([key, value]) => {
        const name = dictionaries[language][`field.${key}`] || t('error.generic')
        const messages = (Array.isArray(value) ? value : [value]).map(message)
        return `${name}: ${messages.join(' · ')}`
      })
      .join(' · ') || t('error.generic')
  )
}
