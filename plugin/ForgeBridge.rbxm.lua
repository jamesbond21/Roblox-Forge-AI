-- Roblox Forge AI Bridge — install this file as a local Studio plugin.
-- HTTP requests must be enabled in Studio > Game Settings > Security.
local HttpService = game:GetService("HttpService")
local ChangeHistoryService = game:GetService("ChangeHistoryService")
local Selection = game:GetService("Selection")
local toolbar = plugin:CreateToolbar("Forge AI")
local toggle = toolbar:CreateButton("Forge Bridge", "Connect this place to the local Roblox Forge AI app", "")
toggle.ClickableWhenViewportHidden = true

local widgetInfo = DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 330, 250, 280, 200)
local widget = plugin:CreateDockWidgetPluginGui("RobloxForgeAI_Bridge", widgetInfo)
widget.Title = "Roblox Forge AI Bridge"

local gui = Instance.new("Frame")
gui.Size = UDim2.fromScale(1, 1); gui.BackgroundColor3 = Color3.fromRGB(22, 25, 28); gui.BorderSizePixel = 0; gui.Parent = widget
local padding = Instance.new("UIPadding"); padding.PaddingTop = UDim.new(0, 14); padding.PaddingLeft = UDim.new(0, 14); padding.PaddingRight = UDim.new(0, 14); padding.Parent = gui
local layout = Instance.new("UIListLayout"); layout.Padding = UDim.new(0, 9); layout.SortOrder = Enum.SortOrder.LayoutOrder; layout.Parent = gui
local function label(text, height, color, order)
 local item=Instance.new("TextLabel"); item.LayoutOrder=order; item.Size=UDim2.new(1,0,0,height); item.BackgroundTransparency=1; item.Text=text; item.TextColor3=color or Color3.fromRGB(210,218,215); item.TextSize=13; item.Font=Enum.Font.Gotham; item.TextXAlignment=Enum.TextXAlignment.Left; item.TextWrapped=true; item.Parent=gui; return item
end
local function input(placeholder, order)
 local item=Instance.new("TextBox"); item.LayoutOrder=order; item.Size=UDim2.new(1,0,0,34); item.BackgroundColor3=Color3.fromRGB(12,15,17); item.BorderColor3=Color3.fromRGB(56,65,59); item.TextColor3=Color3.fromRGB(230,236,229); item.PlaceholderColor3=Color3.fromRGB(120,130,128); item.PlaceholderText=placeholder; item.TextSize=11; item.Font=Enum.Font.Code; item.ClearTextOnFocus=false; item.TextXAlignment=Enum.TextXAlignment.Left; item.Parent=gui; return item
end
local function button(text, order)
 local item=Instance.new("TextButton"); item.LayoutOrder=order; item.Size=UDim2.new(1,0,0,34); item.BackgroundColor3=Color3.fromRGB(184,238,106); item.BorderSizePixel=0; item.TextColor3=Color3.fromRGB(24,35,18); item.Text=text; item.TextSize=12; item.Font=Enum.Font.GothamBold; item.Parent=gui; return item
end
label("Connect this Studio place to Forge running on this computer.",36,Color3.fromRGB(161,174,167),1)
local endpointBox=input("http://127.0.0.1:4173",2); endpointBox.Text=plugin:GetSetting("forgeEndpoint") or "http://127.0.0.1:4173"
local tokenBox=input("Paste the local bridge token",3); tokenBox.Text=plugin:GetSetting("forgeToken") or ""
local connectButton=button("Connect to Forge",4)
local status=label("Not connected",30,Color3.fromRGB(152,165,153),5)
label("Keep the Forge server open. Scripts arrive under their mapped Roblox services.",40,Color3.fromRGB(112,124,119),6)

local connected=false
local function serviceFor(name)
 local ok,service=pcall(function() return game:GetService(name) end)
 if ok and service then return service end
 return nil
end
local function targetFor(path, kind)
 local safe=string.gsub(path,"\\", "/")
 if string.find(safe,"..",1,true) then error("Unsafe file path") end
 local parts={}
 for part in string.gmatch(safe,"[^/]+") do table.insert(parts,part) end
 if #parts==0 then error("Empty file path") end
 local serviceName=parts[1]
 local recognized={Workspace=true,ReplicatedStorage=true,ServerScriptService=true,ServerStorage=true,StarterGui=true,StarterPack=true,StarterPlayer=true,Lighting=true,SoundService=true}
 local root
 if recognized[serviceName] then root=serviceFor(serviceName); table.remove(parts,1)
 else
   local ext=string.lower(parts[1])
   if ext=="effects" or ext=="replicatedstorage" then root=game:GetService("ReplicatedStorage")
   else root=game:GetService("ServerScriptService") end
 end
 if not root then error("Target service is unavailable") end
 if #parts==0 then table.insert(parts,"ForgeGenerated") end
 local parent=root
 for i=1,#parts-1 do
   local folderName=string.gsub(parts[i],"[^%w _%-]", "")
   if folderName=="" then folderName="Generated" end
   local child=parent:FindFirstChild(folderName)
   if not child then child=Instance.new("Folder"); child.Name=folderName; child.Parent=parent end
   parent=child
 end
 local fileName=parts[#parts]
 local base=string.gsub(fileName,"%.server%.lua$",""); base=string.gsub(base,"%.client%.lua$",""); base=string.gsub(base,"%.lua$",""); base=string.gsub(base,"%.md$","")
 base=string.gsub(base,"[^%w _%-]", ""); if base=="" then base="ForgeGenerated" end
 if kind=="Text" or string.match(fileName,"%.md$") then
   local notes=game:GetService("ReplicatedStorage"):FindFirstChild("ForgeNotes")
   if not notes then notes=Instance.new("Folder"); notes.Name="ForgeNotes"; notes.Parent=game:GetService("ReplicatedStorage") end
   local value=notes:FindFirstChild(base); if not value then value=Instance.new("StringValue"); value.Name=base; value.Parent=notes end
   value.Value="" -- content is assigned by receiver below
   return value
 end
 local className="Script"
 if string.match(fileName,"%.client%.lua$") then className="LocalScript"
 elseif kind=="ModuleScript" or (string.match(fileName,"%.lua$") and not string.match(fileName,"%.server%.lua$")) then className="ModuleScript" end
 local object=parent:FindFirstChild(base)
 if object and object.ClassName~=className then object:Destroy(); object=nil end
 if not object then object=Instance.new(className); object.Name=base; object.Parent=parent end
 return object
end

local function request(method, url, body)
 local response=HttpService:RequestAsync({Url=url,Method=method,Headers={ ["Content-Type"]="application/json" },Body=body and HttpService:JSONEncode(body) or nil})
 if not response.Success then error("Forge server replied HTTP "..tostring(response.StatusCode)) end
 return response.Body~="" and HttpService:JSONDecode(response.Body) or {}
end
local function poll()
 if not connected then return end
 local base=string.gsub(endpointBox.Text,"/$",""); local token=tokenBox.Text
 local ok,result=pcall(function() return request("GET",base.."/api/studio/next?token="..HttpService:UrlEncode(token)) end)
 if not ok then status.Text="Connection error: "..tostring(result); status.TextColor3=Color3.fromRGB(229,143,126); return end
 local item=result.item
 if not item then status.Text="Connected · waiting for generated files"; status.TextColor3=Color3.fromRGB(165,190,143); return end
 local success,message=pcall(function()
   local target=targetFor(item.path,item.kind)
   if target:IsA("Script") or target:IsA("ModuleScript") or target:IsA("LocalScript") then target.Source=item.content
   elseif target:IsA("StringValue") then target.Value=item.content end
   Selection:Set({target})
 end)
 local ackOk,ackErr=pcall(function() request("POST",base.."/api/studio/ack?token="..HttpService:UrlEncode(token),{id=item.id,status=success and "inserted" or "error",message=success and item.path or tostring(message)}) end)
 if success then status.Text="Inserted: "..item.path; status.TextColor3=Color3.fromRGB(190,232,151)
 else status.Text="Insert failed: "..tostring(message); status.TextColor3=Color3.fromRGB(229,143,126) end
 if not ackOk then warn("Forge acknowledgement failed: "..tostring(ackErr)) end
end

connectButton.Activated:Connect(function()
 if connected then connected=false; connectButton.Text="Connect to Forge"; status.Text="Disconnected"; return end
 if endpointBox.Text=="" or tokenBox.Text=="" then status.Text="Enter the endpoint and token from Forge's Studio Bridge page."; return end
 plugin:SetSetting("forgeEndpoint",endpointBox.Text); plugin:SetSetting("forgeToken",tokenBox.Text)
 local ok,err=pcall(function() request("GET",string.gsub(endpointBox.Text,"/$","").."/api/studio/queue?token="..HttpService:UrlEncode(tokenBox.Text)) end)
 if not ok then status.Text="Cannot connect: "..tostring(err); status.TextColor3=Color3.fromRGB(229,143,126); return end
 connected=true; connectButton.Text="Disconnect"; status.Text="Connected · waiting for generated files"; status.TextColor3=Color3.fromRGB(165,190,143)
 task.spawn(function() while connected do poll(); task.wait(2) end end)
end)
toggle.Click:Connect(function() widget.Enabled=not widget.Enabled end)
