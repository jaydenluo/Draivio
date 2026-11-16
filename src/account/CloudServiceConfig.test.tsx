import {fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it} from 'vitest'
import {CloudServiceConfig} from './CloudServiceConfig'
import {cloudAccount,DEFAULT_CLOUD_ORIGIN} from './cloudAccount'
import {message} from '../ui/message'
afterEach(()=>{cloudAccount.configureOrigin(DEFAULT_CLOUD_ORIGIN);localStorage.clear();message.destroy()})
it('saves a normalized configurable domain and rejects API paths',()=>{
 let changed=0;render(<CloudServiceConfig onChanged={()=>changed++}/>)
 const input=screen.getByLabelText('云服务地址')
 fireEvent.change(input,{target:{value:'https://other-cloud.example/'}})
 fireEvent.click(screen.getByRole('button',{name:'保存地址'}))
 expect(cloudAccount.getOrigin()).toBe('https://other-cloud.example')
 expect(localStorage.getItem('draivio-cloud-origin')).toBe('https://other-cloud.example');expect(changed).toBe(1)
 fireEvent.change(input,{target:{value:'https://other-cloud.example/api'}})
 fireEvent.click(screen.getByRole('button',{name:'保存地址'}))
 expect(cloudAccount.getOrigin()).toBe('https://other-cloud.example');expect(changed).toBe(1)
})
