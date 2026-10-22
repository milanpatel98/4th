// Screenshots of the live site at phone size, for the README. Run by .github/workflows/shots.yml.
import { chromium } from 'playwright'
const URL = process.env.SITE || 'https://milanpatel98.github.io/4th/'
const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] })
const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const settle = async () => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(2500) }
const day = process.env.DAY
await page.goto(day ? `${URL}#/d/${day}` : URL); await settle()
await page.screenshot({ path: 'out/tonight.png' })
const ids = await page.$$eval('a[href*="#/g/"]', (as) => as.map((a) => a.getAttribute('href')))
await page.goto(URL + (process.env.GAME ? `#/g/${process.env.GAME}` : ids[0])); await settle()
await page.screenshot({ path: 'out/game.png' })
await page.screenshot({ path: 'out/game-full.png', fullPage: true })
await page.goto(`${URL}#/season`); await settle()
await page.screenshot({ path: 'out/season.png' })
await page.setViewportSize({ width: 1280, height: 800 })
await page.goto(URL + (process.env.GAME ? `#/g/${process.env.GAME}` : ids[0])); await settle()
await page.screenshot({ path: 'out/game-desktop.png' })
console.log(ids.length, 'games')
await browser.close()
