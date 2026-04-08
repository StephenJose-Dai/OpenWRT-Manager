import React, { useState, useEffect, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Switch, Alert, Canvas
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { routerManager, OpenWrtClient } from '../services/openwrt'
import { useAppStore } from '../store'

const C = { bg:'#0d1117', bg2:'#161b22', border:'#30363d', text:'#e6edf3', muted:'#8b949e', blue:'#4f8ef7', green:'#22c55e', red:'#f85149' }

function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function AddScreen({ navigation, route }) {
  const prefill = route.params || {}
  const [form, setForm] = useState({
    label: prefill.label || '',
    host:  prefill.host  || '',
    port:  80,
    username: 'root',
    password: '',
    rememberPassword: true,
    autoLogin: false,
    ...prefill
  })
  const [showPwd,     setShowPwd]     = useState(false)
  const [captchaCode, setCaptchaCode] = useState('')
  const [captchaInput,setCaptchaInput]= useState('')
  const [testResult,  setTestResult]  = useState('')   // '' | 'ok' | 'fail'
  const [testing,     setTesting]     = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [errors,      setErrors]      = useState({})
  const setConnection = useAppStore(s => s.setConnection)

  useEffect(() => { setCaptchaCode(genCode()) }, [])

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const testConnect = async () => {
    if (!form.host) { Alert.alert('提示', '请先填写路由器地址'); return }
    setTesting(true); setTestResult('')
    try {
      const client = new OpenWrtClient({ host: form.host, port: +form.port, username: form.username, password: form.password })
      await client.login()
      setTestResult('ok')
    } catch { setTestResult('fail') }
    setTesting(false)
  }

  const save = async () => {
    const errs = {}
    if (!form.host)     errs.host     = '请填写路由器地址'
    if (!form.password) errs.password = '请填写密码'
    if (captchaInput.trim().toLowerCase() !== captchaCode.toLowerCase()) {
      errs.captcha = '验证码错误'
      setCaptchaCode(genCode())
      setCaptchaInput('')
    }
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const client = new OpenWrtClient({
        host: form.host, port: +form.port,
        username: form.username, password: form.password
      })
      await client.login()
      const id = await routerManager.add({
        ...form,
        label:    form.label || form.host,
        port:     +form.port,
        password: form.rememberPassword ? form.password : '',
        id:       prefill.id
      })
      setConnection(client, { ...routerManager.get(id), password: form.password })
      navigation.replace('Main')
    } catch (e) {
      Alert.alert('连接失败', e.message)
    }
    setSaving(false)
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Back */}
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>← 返回</Text></TouchableOpacity>
          <Text style={s.title}>{prefill.id ? '编辑路由器' : '添加路由器'}</Text>
        </View>

        {/* Label */}
        <View style={s.field}>
          <Text style={s.label}>显示名称</Text>
          <TextInput style={s.input} placeholder="如：家里的路由器" placeholderTextColor={C.muted} value={form.label} onChangeText={v => set('label', v)} />
        </View>

        {/* Host + Port */}
        <View style={s.field}>
          <Text style={s.label}>路由器地址 <Text style={s.req}>*</Text></Text>
          <View style={s.row}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="192.168.1.1 或域名" placeholderTextColor={C.muted} value={form.host} onChangeText={v => set('host', v)} autoCapitalize="none" keyboardType="url" />
            <TextInput style={[s.input, s.portInput]} placeholder="80" placeholderTextColor={C.muted} value={String(form.port)} onChangeText={v => set('port', v)} keyboardType="number-pad" />
          </View>
          {errors.host && <Text style={s.errMsg}>{errors.host}</Text>}
        </View>

        {/* Username */}
        <View style={s.field}>
          <Text style={s.label}>用户名</Text>
          <TextInput style={s.input} value={form.username} onChangeText={v => set('username', v)} autoCapitalize="none" placeholderTextColor={C.muted} />
        </View>

        {/* Password */}
        <View style={s.field}>
          <Text style={s.label}>密码 <Text style={s.req}>*</Text></Text>
          <View style={s.row}>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="路由器登录密码" placeholderTextColor={C.muted} value={form.password} onChangeText={v => set('password', v)} secureTextEntry={!showPwd} />
            <TouchableOpacity style={s.showBtn} onPress={() => setShowPwd(v => !v)}>
              <Text style={s.showBtnText}>{showPwd ? '隐藏' : '显示'}</Text>
            </TouchableOpacity>
          </View>
          {errors.password && <Text style={s.errMsg}>{errors.password}</Text>}
        </View>

        {/* Test */}
        <View style={s.testRow}>
          <TouchableOpacity style={[s.testBtn, testing && s.dim]} onPress={testConnect} disabled={testing}>
            <Text style={s.testBtnText}>{testing ? '测试中...' : '测试连接'}</Text>
          </TouchableOpacity>
          {testResult === 'ok'   && <Text style={s.testOk}>✓ 连接成功</Text>}
          {testResult === 'fail' && <Text style={s.testFail}>✗ 连接失败</Text>}
        </View>

        {/* Captcha */}
        <View style={s.field}>
          <Text style={s.label}>验证码 <Text style={s.req}>*</Text></Text>
          <View style={s.row}>
            <View style={s.captchaBox}>
              <Text style={s.captchaText}>{captchaCode}</Text>
              <TouchableOpacity onPress={() => { setCaptchaCode(genCode()); setCaptchaInput('') }} style={s.captchaRefresh}>
                <Text style={s.captchaRefreshText}>↻</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={[s.input, { flex: 1 }]} placeholder="输入验证码" placeholderTextColor={C.muted} value={captchaInput} onChangeText={setCaptchaInput} maxLength={4} autoCapitalize="none" />
          </View>
          {errors.captcha && <Text style={s.errMsg}>{errors.captcha}</Text>}
          <Text style={s.hint}>点击验证码刷新</Text>
        </View>

        {/* Options */}
        <View style={s.optionRow}>
          <Text style={s.optionLabel}>记住密码</Text>
          <Switch value={form.rememberPassword} onValueChange={v => { set('rememberPassword', v); if (!v) set('autoLogin', false) }} trackColor={{ true: C.blue }} />
        </View>
        <View style={[s.optionRow, !form.rememberPassword && s.dim]}>
          <Text style={s.optionLabel}>自动登录{!form.rememberPassword ? '（需先开启记住密码）' : ''}</Text>
          <Switch value={form.autoLogin} onValueChange={v => set('autoLogin', v)} disabled={!form.rememberPassword} trackColor={{ true: C.blue }} />
        </View>

        {/* Save */}
        <TouchableOpacity style={[s.saveBtn, saving && s.dim]} onPress={save} disabled={saving}>
          <Text style={s.saveBtnText}>{saving ? '连接中...' : '保存并连接'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  scroll:  { flex: 1 },
  content: { padding: 20, paddingBottom: 60 },
  topBar:  { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 },
  back:    { fontSize: 14, color: C.muted },
  title:   { fontSize: 18, fontWeight: '700', color: C.text },
  field:   { marginBottom: 16 },
  label:   { fontSize: 12, color: C.muted, marginBottom: 5 },
  req:     { color: C.red },
  input:   { backgroundColor: C.bg2, borderWidth: 1, borderColor: C.border, borderRadius: 8, color: C.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  row:     { flexDirection: 'row', gap: 8, alignItems: 'center' },
  portInput: { width: 72 },
  errMsg:  { fontSize: 11, color: C.red, marginTop: 3 },
  showBtn: { paddingHorizontal: 12 },
  showBtnText: { fontSize: 13, color: C.blue },
  testRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  testBtn: { backgroundColor: '#21262d', borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 9 },
  testBtnText: { fontSize: 13, color: C.text },
  testOk:  { fontSize: 13, color: C.green },
  testFail:{ fontSize: 13, color: C.red },
  captchaBox: { width: 120, height: 42, backgroundColor: '#1e2530', borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, gap: 4 },
  captchaText: { fontSize: 22, fontWeight: '700', color: C.blue, letterSpacing: 4 },
  captchaRefresh: { padding: 4 },
  captchaRefreshText: { fontSize: 16, color: C.muted },
  hint:    { fontSize: 11, color: C.muted, marginTop: 3 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderColor: C.border },
  optionLabel: { fontSize: 14, color: C.text },
  dim:     { opacity: 0.5 },
  saveBtn: { backgroundColor: C.blue, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 20 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
