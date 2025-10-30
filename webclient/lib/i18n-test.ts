// 国际化功能测试脚本
import i18n from './i18n'

export function testI18n() {
  console.log('🧪 测试国际化功能')

  // 测试中文
  i18n.changeLanguage('zh-CN')
  console.log('🇨🇳 中文测试:')
  console.log('  App Title:', i18n.t('app.title'))
  console.log('  Sidebar Feed:', i18n.t('sidebar.feed'))
  console.log('  Settings Title:', i18n.t('settings.title'))
  console.log('  Network Title:', i18n.t('settings.network.title'))

  // 测试英文
  i18n.changeLanguage('en-US')
  console.log('\n🇺🇸 English Test:')
  console.log('  App Title:', i18n.t('app.title'))
  console.log('  Sidebar Feed:', i18n.t('sidebar.feed'))
  console.log('  Settings Title:', i18n.t('settings.title'))
  console.log('  Network Title:', i18n.t('settings.network.title'))

  // 测试插值
  console.log('\n🔧 插值测试:')
  i18n.changeLanguage('zh-CN')
  console.log('  Session:', i18n.t('session.description', { seed: 'test123' }))
  i18n.changeLanguage('en-US')
  console.log('  Session:', i18n.t('session.description', { seed: 'test123' }))

  console.log('\n✅ 国际化测试完成！')
}