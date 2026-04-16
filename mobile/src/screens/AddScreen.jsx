import React, { useState, useEffect } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { routerManager, OpenWrtClient } from '../services/openwrt'
import { useAppStore } from '../store'

const C = { bg:'#0d1117', bg2:'#161b22', bg3:'#21262d', border:'#30363d', text:'#e6edf3', muted:'#8b949e', blue:'#4f8ef7', green:'#22c55e', red:'#f85149', yellow:'#f59e0b' }

function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function AddScreen({ navigation, route }) {
  const prefill = route.params || {}
  const isEdit  = !!prefill.id

  const [proto,      setProto]      = useState(prefill.https ? 'https' : 'http')
  const [host,       setHost]       = useState(prefill.host  || '')
  const [port,       setPort]       = useState(String(prefill.port || (prefill.https ? 443 : 80)))
  const [label,      setLabel]      = useState(prefill.label || '')
  const [username,   setUsername]   = useState(prefill.username || 'root')
  const [password,   setPassword]   = useState(prefill.password || '')
  const [ignoreSSL,  setIgnoreSSL]  = useState(prefill.ignoreSSL !== undefined ? prefill.ignoreSSL : !!prefill.https)
  const [rememberPwd,setRememberPwd]= useState(prefill.rememberPassword !== false)
  const [autoLogin,  setAutoLogin]  = useState(prefill.autoLogin || false)
  const [showPwd,    setShowPwd]    = useState(false)
  const [captcha,    setCaptcha]    = useState(genCode())
  const [captchaIn,  setCaptchaIn]  = useState('')
  const [testResult, setTestResult] = useState('')
  const [testing,    setTesting]    = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [errors,     setErrors]     = useState({})
  const setConnection = useAppStore(s => s.setConnection)

  const switchProto = (p) => {
    setProto(p)
    setPort(p === 'https' ? '443' : '80')
    setIgnoreSSL(p === 'https') // HTTPS 默认忽略证书
  }

  const testConnect = async () => {
    if (!host) { Alert.alert('提示', '请先填写路由器地址'); return }
    setTesting(true); setTestResult('')
    try {
      const c = new OpenWrtClient({ host, port: +port, https: proto === 'https', ignoreSSL, username, password })
      await c.login()
      setTestResult('ok')
    } catch (e) {
      const m = e.message || ''
      if (m.includes('超时') || m.includes('TIMED_OUT')) setTestResult('timeout')
      else if (m.includes('certificate') || m.includes('SSL')) setTestResult('ssl')
      else setTestResult('fail:' + m)
    }
    setTesting(false)
  }

  const save = async () => {
    const errs = {}
    if (!host)     errs.host     = '请填写路由器地址'
    if (!password) errs.password = '请填写密码'
    if (captchaIn.trim().toLowerCase() !== captcha.toLowerCase()) {
      errs.captcha = '验证码错误'; setCaptcha(genCode()); setCaptchaIn('')
    }
    setErrors(errs)
    if (Object.keys(errs).length) return

    setSaving(true)
    try {
      const cfg = {
        id: prefill.id, label: label || host,
        host, port: +port, https: proto === 'https', ignoreSSL,
        username, password: rememberPwd ? password : '',
        rememberPassword: rememberPwd, autoLogin
      }
      const client = new OpenWrtClient({ ...cfg, password })
      await client.login()
      // 自动配置 ACL
      client.setupACL().catch(() => {})
      const id = await routerManager.add(cfg)
      setConnection(client, { ...routerManager.get(id), password })
      navigation.replace('Main')
    } catch (e) { Alert.alert('连接失败', e.message) }
    setSaving(false)
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={s.back}>← 返回</Text></TouchableOpacity>
          <Text style={s.title}>{isEdit ? '编辑路由器' : '添加路由器'}</Text>
        </View>

        {/* 显示名称 */}
        <View style={s.field}>
          <Text style={s.label}>显示名称</Text>
          <TextInput style={s.input} placeholder="如：家里的路由器" placeholderTextColor={C.muted} value={label} onChangeText={setLabel} />
        </View>

        {/* 协议 + 地址 + 端口 */}
        <View style={s.field}>
          <Text style={s.label}>路由器地址 <Text style={s.req}>*</Text></Text>
          <View style={s.row}>
            {/* 协议切换 */}
            <View style={s.protoSwitch}>
              {['http','https'].map(p => (
                <TouchableOpacity key={p} style={[s.protoBtn, proto===p && s.protoBtnActive]} onPress={() => switchProto(p)}>
                  <Text style={[s.protoBtnText, proto===p && s.protoBtnTextActive]}>{p.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={[s.input, {flex:1}]} placeholder="192.168.1.1" placeholderTextColor={C.muted}
              value={host} onChangeText={setHost} autoCapitalize="none" keyboardType="url" />
            <TextInput style={[s.input, s.portInput]} placeholder="80" placeholderTextColor={C.muted}
              value={port} onChangeText={setPort} keyboardType="number-pad" />
          </View>
          <Text style={s.urlPreview}>{proto}://{host || 'x.x.x.x'}{((proto==='http'&&port==='80')||(proto==='https'&&port==='443')) ? '' : ':'+port}/ubus</Text>
          {errors.host && <Text style={s.errMsg}>{errors.host}</Text>}
        </View>

        {/* 忽略SSL（HTTPS时显示） */}
        {proto === 'https' && (
          <View style={s.sslCard}>
            <View style={s.sslLeft}>
              <Text style={s.sslTitle}>忽略 SSL 证书错误</Text>
              <Text style={s.sslDesc}>使用自签名证书或证书已过期时开启</Text>
            </View>
            <Switch value={ignoreSSL} onValueChange={setIgnoreSSL} trackColor={{ true: C.yellow }} thumbColor="#fff" />
          </View>
        )}

        {/* 用户名 */}
        <View style={s.field}>
          <Text style={s.label}>用户名</Text>
          <TextInput style={s.input} value={username} onChangeText={setUsername} autoCapitalize="none" placeholderTextColor={C.muted} />
        </View>

        {/* 密码 */}
        <View style={s.field}>
          <Text style={s.label}>密码 <Text style={s.req}>*</Text></Text>
          <View style={s.row}>
            <TextInput style={[s.input, {flex:1}]} placeholder="路由器登录密码" placeholderTextColor={C.muted}
              value={password} onChangeText={setPassword} secureTextEntry={!showPwd} />
            <TouchableOpacity style={s.showBtn} onPress={() => setShowPwd(v => !v)}>
              <Text style={s.showBtnText}>{showPwd ? '隐藏' : '显示'}</Text>
            </TouchableOpacity>
          </View>
          {errors.password && <Text style={s.errMsg}>{errors.password}</Text>}
        </View>

        {/* 测试连接 */}
        <View style={s.testRow}>
          <TouchableOpacity style={[s.testBtn, testing && s.dim]} onPress={testConnect} disabled={testing}>
            <Text style={s.testBtnText}>{testing ? '测试中...' : '测试连接'}</Text>
          </TouchableOpacity>
          {testResult === 'ok'      && <Text style={s.testOk}>✓ 连接成功</Text>}
          {testResult === 'timeout' && <Text style={s.testFail}>超时，检查 IP 和端口</Text>}
          {testResult === 'ssl'     && <Text style={s.testFail}>SSL 错误，请开启忽略证书</Text>}
          {testResult.startsWith('fail:') && <Text style={s.testFail}>{testResult.slice(5)}</Text>}
        </View>

        {/* 验证码 */}
        <View style={s.field}>
          <Text style={s.label}>验证码 <Text style={s.req}>*</Text></Text>
          <View style={s.row}>
            <TouchableOpacity style={s.captchaBox} onPress={() => { setCaptcha(genCode()); setCaptchaIn('') }}>
              <Text style={s.captchaText}>{captcha}</Text>
            </TouchableOpacity>
            <TextInput style={[s.input, {flex:1}]} placeholder="输入验证码，点击刷新" placeholderTextColor={C.muted}
              value={captchaIn} onChangeText={setCaptchaIn} maxLength={4} autoCapitalize="none" />
          </View>
          {errors.captcha && <Text style={s.errMsg}>{errors.captcha}</Text>}
        </View>

        {/* 选项 */}
        <View style={s.optRow}>
          <Text style={s.optLabel}>记住密码</Text>
          <Switch value={rememberPwd} onValueChange={v => { setRememberPwd(v); if (!v) setAutoLogin(false) }} trackColor={{ true: C.blue }} thumbColor="#fff" />
        </View>
        <View style={[s.optRow, !rememberPwd && s.dim]}>
          <Text style={s.optLabel}>自动登录{!rememberPwd ? '（需先开启记住密码）' : ''}</Text>
          <Switch value={autoLogin} onValueChange={setAutoLogin} disabled={!rememberPwd} trackColor={{ true: C.blue }} thumbColor="#fff" />
        </View>

        <TouchableOpacity style={[s.saveBtn, saving && s.dim]} onPress={save} disabled={saving}>
          <Text style={s.saveBtnText}>{saving ? '连接中...' : '保存并连接'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:    { flex:1, backgroundColor:C.bg },
  content: { padding:20, paddingBottom:60 },
  topBar:  { flexDirection:'row', alignItems:'center', gap:14, marginBottom:24 },
  back:    { fontSize:14, color:C.muted },
  title:   { fontSize:18, fontWeight:'700', color:C.text },
  field:   { marginBottom:16 },
  label:   { fontSize:12, color:C.muted, marginBottom:5 },
  req:     { color:C.red },
  input:   { backgroundColor:C.bg2, borderWidth:1, borderColor:C.border, borderRadius:8, color:C.text, paddingHorizontal:12, paddingVertical:10, fontSize:14 },
  row:     { flexDirection:'row', gap:8, alignItems:'center' },
  portInput: { width:72 },
  urlPreview: { fontSize:11, color:C.muted, marginTop:4, fontFamily:'monospace' },
  errMsg:  { fontSize:11, color:C.red, marginTop:3 },
  protoSwitch: { flexDirection:'row', backgroundColor:C.bg3, borderRadius:8, borderWidth:1, borderColor:C.border, overflow:'hidden' },
  protoBtn:    { paddingHorizontal:12, paddingVertical:10 },
  protoBtnActive: { backgroundColor:C.blue },
  protoBtnText:   { fontSize:12, color:C.muted, fontWeight:'600' },
  protoBtnTextActive: { color:'#fff' },
  sslCard: { backgroundColor:'#1a2332', borderWidth:1, borderColor:'#2d3748', borderRadius:10, padding:14, flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:16 },
  sslLeft: { flex:1, marginRight:12 },
  sslTitle:{ fontSize:14, fontWeight:'500', color:C.text },
  sslDesc: { fontSize:12, color:C.muted, marginTop:2 },
  showBtn: { paddingHorizontal:12 },
  showBtnText: { fontSize:13, color:C.blue },
  testRow: { flexDirection:'row', alignItems:'center', gap:12, marginBottom:16 },
  testBtn: { backgroundColor:C.bg3, borderWidth:1, borderColor:C.border, borderRadius:8, paddingHorizontal:16, paddingVertical:9 },
  testBtnText: { fontSize:13, color:C.text },
  testOk:  { fontSize:13, color:C.green },
  testFail:{ fontSize:12, color:C.red, flex:1 },
  captchaBox: { width:110, height:44, backgroundColor:'#1e2530', borderRadius:8, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:C.border },
  captchaText: { fontSize:22, fontWeight:'700', color:C.blue, letterSpacing:4 },
  optRow:  { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:12, borderBottomWidth:1, borderColor:C.border },
  optLabel:{ fontSize:14, color:C.text },
  dim:     { opacity:0.5 },
  saveBtn: { backgroundColor:C.blue, borderRadius:12, padding:16, alignItems:'center', marginTop:20 },
  saveBtnText: { color:'#fff', fontSize:16, fontWeight:'600' },
})
