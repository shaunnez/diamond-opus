import { gql } from "graphql-request";

export const AUTHENTICATE_QUERY = gql`
  query Authenticate($username: String!, $password: String!) {
    authenticate {
      username_and_password(username: $username, password: $password) {
        token
      }
    }
  }
`;

export const DIAMONDS_COUNT_QUERY = gql`
  query GetDiamondsCount($token: String!, $query: DiamondQuery!) {
    as(token: $token) {
      diamonds_by_query_count(query: $query)
    }
  }
`;


export const DIAMONDS_BY_QUERY = gql`
  query DiamondsByQuery(
    $token: String!
    $query: DiamondQuery!
    $offset: Int
    $limit: Int
    $order: DiamondOrder
  ) {
    as(token: $token) {
      diamonds_by_query(
        query: $query
        offset: $offset
        limit: $limit
        order: $order
      ) {
        total_count
        items {
          id
          price
          discount
          diamond_price
          markup_price
          markup_discount
          diamond {
            id
            # todo: remove these
            availability
            HoldId
            NivodaStockId
            # todo: end remove these
            supplierStockId
            image
            video
            eyeClean
            brown
            green
            blue
            gray
            milky
            bowtie
            mine_of_origin
            supplier_video_link
            approval_type
            final_price
            show_measurements
            show_certificate_number
            return_window
            CertificateType
            # todo mapping here
            scs_certificate
            country_of_polishing
            other
            supplierStockId
            v360 {
              id
              url
            }
            # todo end mapping here
            delivery_time {
              express_timeline_applicable
              min_business_days
              max_business_days
            }
            certificate {
              id
              lab
              certNumber
              pdfUrl
              shape
              fullShape
              carats
              cut
              polish
              symmetry
              color
              length
              width
              depth
              depthPercentage
              table
              crownAngle
              crownHeight
              pavAngle
              pavHeight
              pavDepth
              verified
              treated
              girdle
              culetSize
              girdleCondition
              culet_condition
              cut_style
              keyToSymbols
              comments
              # todo mapping here
              f_color
              f_intensity
              f_overtone
              colorShade
              brown
              green
              blue
              gray
              mix_tinge
              milky
              bowtie
              eyeclean
              starLength
              lowerGirdle
              clarity
              floInt
              floCol
              labgrown_type
              labgrown
              image
              video
              country_of_origin
              v360 {
                id
                url
              }
              product_videos {
                id
                url
                loupe360_url
                type
              }
              product_images {
                id
                url
                loupe360_url
                type
              }
              # todo end mapping here
            }
            supplier {
              id
              name
              legal_name
            }
          }
        }
      }
    }
  }
`;

export const CREATE_HOLD_MUTATION = gql`
  mutation CreateHold($token: String!, $productId: ID!) {
    as(token: $token) {
      create_hold(ProductId: $productId, ProductType: Diamond) {
        id
        denied
        until
      }
    }
  }
`;

export const CANCEL_HOLD_MUTATION = gql`
  mutation CancelHold($token: String!, $holdId: ID!) {
    as(token: $token) {
      cancel_hold(hold_id: $holdId) {
        id
        denied
        until
      }
    }
  }
`;

export const CREATE_ORDER_MUTATION = gql`
  mutation CreateOrder($token: String!, $items: [OrderItemInput!]!) {
    as(token: $token) {
      create_order(items: $items)
    }
  }
`;
