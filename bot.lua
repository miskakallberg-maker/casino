-- Growblock Bot - Drop Version
local home = os.getenv("USERPROFILE") or os.getenv("HOME")

function log(msg)
    local file = io.open(home .. "\\Desktop\\depo\\bot-log.txt", "a")
    if file then
        file:write(os.date("%H:%M:%S") .. " " .. msg .. "\n")
        file:close()
    end
    print("[BOT] " .. msg)
end

log("Drop Bot Starting...")

local processedPlayers = {}

function readFile(filename)
    local file = io.open(filename, "r")
    if not file then return nil end
    local content = file:read("*a")
    file:close()
    return content
end

function appendFile(filename, content)
    local file = io.open(filename, "a")
    if file then
        file:write(content .. "\n")
        file:close()
        return true
    end
    return false
end

function writeFile(filename, content)
    local file = io.open(filename, "w")
    if file then
        file:write(content)
        file:close()
        return true
    end
    return false
end

function findWithdraws(playerName)
    local content = readFile(home .. "\\Desktop\\depo\\withdraw_pending.txt")
    if not content then return {} end
    
    local results = {}
    for line in content:gmatch("[^\r\n]+") do
        if line:find("WITHDRAW|") then
            local gtName, amount, id = line:match("WITHDRAW|([^|]+)|([^|]+)|(.+)")
            if gtName == playerName then
                table.insert(results, { playerName = gtName, amount = amount, id = id })
            end
        end
    end
    return results
end

function removeWithdraw(id)
    local content = readFile(home .. "\\Desktop\\depo\\withdraw_pending.txt")
    if not content then return end
    
    local lines = {}
    for line in content:gmatch("[^\r\n]+") do
        if not line:find(id) then
            table.insert(lines, line)
        end
    end
    local newContent = #lines > 0 and table.concat(lines, "\n") .. "\n" or ""
    writeFile(home .. "\\Desktop\\depo\\withdraw_pending.txt", newContent)
end

local currentPlayer = nil

AddCallback("main", "OnVarlist", function(varlist)
    local t = varlist[0]
    local msg = varlist[1] or ""
    
    if t == "OnConsoleMessage" then
        if msg:find(" entered,") then
            local player = msg:match("`w([^`]+)`` entered")
            if player then
                log("Player entered: " .. player)
                currentPlayer = player
                
                -- Signal Python bot that player joined
                local readyFile = io.open(home .. "\\Desktop\\depo\\player_" .. player .. ".ready", "w")
                if readyFile then
                    readyFile:write("ready")
                    readyFile:close()
                    log("Signaled Python bot: player_" .. player .. ".ready")
                end
                
                -- Skip if already processed this session
                if processedPlayers[player] then
                    log("Already processed " .. player .. " this session, skipping")
                    return
                end
                
                -- Check for withdrawals (always check, don't skip)
                local withdraws = findWithdraws(player)
                if #withdraws > 0 then
                    local totalAmount = 0
                    for i, withdraw in ipairs(withdraws) do
                        if not processedPlayers[withdraw.id] then
                            local amount = tonumber(withdraw.amount)
                            if amount and amount > 0 then
                                totalAmount = totalAmount + amount
                                log("Found withdrawal: " .. amount .. " WL for " .. player)
                                
                                -- Mark this withdrawal ID as processed
                                processedPlayers[withdraw.id] = true
                                
                                -- Mark as completed
                                appendFile(home .. "\\Desktop\\depo\\withdraw_completed.txt", "COMPLETED|" .. withdraw.id)
                                log("Marked withdrawal as completed: " .. withdraw.id)
                                
                                -- Remove from pending
                                removeWithdraw(withdraw.id)
                                log("Removed from pending: " .. withdraw.id)
                            end
                        else
                            log("Already processed withdrawal " .. withdraw.id)
                        end
                    end
                    
                    -- Write ONE drop command with total amount
                    if totalAmount > 0 then
                        appendFile(home .. "\\Desktop\\depo\\drop_command.txt", "DROP|" .. totalAmount)
                        log("Wrote DROP|" .. totalAmount .. " to drop_command.txt")
                    end
                else
                    log("No withdrawal found for " .. player)
                end
            end
        end
        
        -- Deposit detection - use tracked player
        if msg:find("Collected") and currentPlayer then
            log("Deposit check - msg: " .. msg)
            if msg:find("World Lock") then
                local amount = msg:match("(%d+) World Lock")
                if amount then
                    log("Deposit: " .. amount .. " WL from " .. currentPlayer)
                    appendFile(home .. "\\Desktop\\depo\\bot_commands.txt", "DEPOSIT|" .. currentPlayer .. "|" .. amount)
                else
                    log("Deposit failed - amount not matched from: " .. msg)
                end
            elseif msg:find("Diamond Lock") then
                local amount = msg:match("(%d+) Diamond Lock")
                if amount then
                    local wlAmount = tonumber(amount) * 100
                    log("Deposit: " .. amount .. " DL from " .. currentPlayer)
                    appendFile(home .. "\\Desktop\\depo\\bot_commands.txt", "DEPOSIT|" .. currentPlayer .. "|" .. wlAmount)
                end
            elseif msg:find("Bold Diamond Lock") then
                local amount = msg:match("(%d+) Bold Diamond Lock")
                if amount then
                    local wlAmount = tonumber(amount) * 10000
                    log("Deposit: " .. amount .. " BGL from " .. currentPlayer)
                    appendFile(home .. "\\Desktop\\depo\\bot_commands.txt", "DEPOSIT|" .. currentPlayer .. "|" .. wlAmount)
                end
            end
        end
        
        if msg:find(" left,") then
            local player = msg:match("`w([^`]+)`` left")
            if player == currentPlayer then
                log("Player left: " .. player)
                currentPlayer = nil
            end
        end
    end
    
    if t == "OnSendToServer" then
        -- Reset when leaving world
        processedPlayers = {}
        currentPlayer = nil
    end
end)

log("Drop Bot Ready!")
log("Will detect players and trigger drop for pending withdrawals")
