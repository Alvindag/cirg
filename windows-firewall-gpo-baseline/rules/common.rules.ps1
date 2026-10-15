<#
Core networking rules needed on every domain-joined Windows machine
regardless of role. Applied by every tier. Keep this list minimal —
anything role-specific belongs in workstation/server/domain-controller
rules, not here.
#>

@(
    @{
        Name        = 'Core-DHCP-In'
        DisplayName = 'Core Networking - DHCP (In)'
        Direction   = 'Inbound'
        Action      = 'Allow'
        Protocol    = 'UDP'
        LocalPort   = 68
        Profile     = 'Domain,Private'
        Group       = 'Core Networking'
        Description = 'DHCP client lease responses.'
    },
    @{
        Name        = 'Core-DNS-Client-In'
        DisplayName = 'Core Networking - DNS Client Responses (In)'
        Direction   = 'Inbound'
        Action      = 'Allow'
        Protocol    = 'UDP'
        LocalPort   = 53
        Profile     = 'Domain,Private'
        Group       = 'Core Networking'
        Description = 'Return traffic for DNS queries this host initiated.'
    },
    @{
        Name        = 'Core-ICMPv4-Echo-In'
        DisplayName = 'Core Networking - ICMPv4 Echo Request (In)'
        Direction   = 'Inbound'
        Action      = 'Allow'
        Protocol    = 'ICMPv4'
        IcmpType    = 8
        RemoteAddress = '<MANAGEMENT_SUBNET>'
        Profile     = 'Domain,Private'
        Group       = 'Core Networking'
        Description = 'Ping from the management/monitoring subnet only - not open to all domain hosts. Replace <MANAGEMENT_SUBNET> at build time.'
    },
    @{
        Name        = 'Core-KerberosTime-Out'
        DisplayName = 'Core Networking - W32Time (Out)'
        Direction   = 'Outbound'
        Action      = 'Allow'
        Protocol    = 'UDP'
        RemotePort  = 123
        Profile     = 'Domain,Private'
        Group       = 'Core Networking'
        Description = 'Time sync against the domain hierarchy. Only needed if outbound is being restricted; no-op under the default allow-outbound profile.'
    }
)
